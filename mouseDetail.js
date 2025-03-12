import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// -----------------------
// Set up margins, dimensions, and SVG container.
const margin = { top: 50, right: 30, bottom: 50, left: 60 };
let container = d3.select("#detail-chart").node();
// Instead of using a fixed height, derive it from the container's clientHeight.
let width = container.clientWidth - margin.left - margin.right;
let height = container.clientHeight - margin.top - margin.bottom;

const svg = d3.select("#detail-chart")
  .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// -----------------------
// Define a clipPath so data to the left of the y–axis is hidden.
const defs = svg.append("defs");
defs.append("clipPath")
    .attr("id", "clip")
  .append("rect")
    .attr("width", width)
    .attr("height", height);

// -----------------------
// Create groups inside a clipping group.
const gClip = svg.append("g")
    .attr("clip-path", "url(#clip)");
const gBackground = gClip.append("g")
    .attr("class", "background-group");
const gData = gClip.append("g")
    .attr("class", "data-group");

// -----------------------
// Create groups for axes (not clipped).
const gXAxis = svg.append("g")
    .attr("class", "x axis")
    .attr("transform", `translate(0, ${height})`);
const gYAxis = svg.append("g")
    .attr("class", "y axis");

// -----------------------
// Scales.
let xScale = d3.scaleTime().range([0, width]);
let yScale = d3.scaleLinear().range([height, 0]);

// A full timeline scale used for scrubbing.
const fullTimeScale = d3.scaleTime()
    .domain([new Date(2023, 0, 1, 0, 0), d3.timeMinute.offset(new Date(2023, 0, 1, 0, 0), 14 * 1440)])
    .range([0, width]);

// -----------------------
// Experiment settings.
const experimentStart = new Date(2023, 0, 1, 0, 0);
const experimentDays = 14;
const totalMinutes = experimentDays * 1440;
const experimentEnd = d3.timeMinute.offset(experimentStart, totalMinutes);
xScale.domain([experimentStart, experimentEnd]); // full domain

// -----------------------
// Declare global variable "phase" early so it can be used by tick formatters.
let phase = 1; // 1: animation phase, 2: final/zoom–out phase

// -----------------------
// Global flag to detect when the brush (interactive panning) is active.
let brushDomainActive = false;

// -----------------------
// Custom Tick Functions.
function getAnimationTickValues(start, end) {
  let ticks = d3.timeHour.every(3).range(start, end);
  let dayTicks = d3.timeDay.every(1).range(start, end);
  ticks = d3.merge([ticks, dayTicks]);
  ticks.sort((a, b) => a - b);
  return ticks;
}
function getFinalTickValues(start, end) {
  let dayTicks = d3.timeDay.every(1).range(start, end);
  let noonTicks = d3.timeDay.every(1).range(start, end).map(d => {
    let noon = new Date(d);
    noon.setHours(12, 0, 0, 0);
    return noon;
  });
  let ticks = d3.merge([dayTicks, noonTicks]);
  ticks.sort((a, b) => a - b);
  return ticks;
}
function xTickFormat(d) {
  const dayNumber = Math.floor((d - experimentStart) / (1000 * 60 * 60 * 24)) + 1;
  const hours = d.getHours();
  if (hours === 0) {
    return `Day ${dayNumber.toString().padStart(2, '0')}`;
  } else {
    return d3.timeFormat("%H:%M")(d);
  }
}

let xAxis = d3.axisBottom(xScale)
    .tickValues(getAnimationTickValues(experimentStart, experimentEnd))
    .tickFormat(xTickFormat);
let yAxis = d3.axisLeft(yScale);

gXAxis.call(xAxis);
gYAxis.call(yAxis);

// -----------------------
// Global variables for animation.
let smoothedMaleGlobal, femaleSegmentsGlobal;
let mouseNumber; // Set from URL.
let currentSimTime = experimentStart; // simulation “current time”
const windowDurationMinutes = 3 * 1440; // fixed sliding window of 3 days
let animationTimer;
let isPaused = false;
let isScrubbing = false;

// -----------------------
// Data line groups.
const malePath = gData.append("path")
  .attr("class", "male-line")
  .attr("fill", "none")
  .attr("stroke", "lightblue")
  .attr("stroke-width", 2);
const femaleLineGroup = gData.append("g")
  .attr("class", "female-line-group");

// -----------------------
// Line generator.
const lineGenerator = d3.line()
  .x(d => xScale(d.time))
  .y(d => yScale(d.value))
  .curve(d3.curveMonotoneX);

// -----------------------
// Draw background (lights off) in gBackground.
function drawBackground() {
  gBackground.selectAll("rect").remove();
  for (let day = 0; day < experimentDays; day++) {
    const dayStart = d3.timeDay.offset(experimentStart, day);
    const sixAM = d3.timeHour.offset(dayStart, 6);
    const sixPM = d3.timeHour.offset(dayStart, 18);
    const nextDay = d3.timeDay.offset(dayStart, 1);
    gBackground.append("rect")
      .attr("class", "background")
      .attr("x", xScale(dayStart))
      .attr("y", 0)
      .attr("width", xScale(sixAM) - xScale(dayStart))
      .attr("height", height)
      .attr("fill", "#e6e6e6");
    gBackground.append("rect")
      .attr("class", "background")
      .attr("x", xScale(sixPM))
      .attr("y", 0)
      .attr("width", xScale(nextDay) - xScale(sixPM))
      .attr("height", height)
      .attr("fill", "#e6e6e6");
  }
}
drawBackground();

// -----------------------
// Smoothing function.
function smoothSeries(data, windowSize) {
  return data.map((d, i, arr) => {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(arr.length, i + Math.floor(windowSize / 2) + 1);
    const windowData = arr.slice(start, end).map(e => e.value);
    return { time: d.time, value: d3.mean(windowData) };
  });
}

// -----------------------
// Data loading.
// Read URL parameters.
const urlParams = new URLSearchParams(window.location.search);
const mouseID = urlParams.get("mouseID");
const mode = urlParams.get("mode") || "temperature";

if (!mouseID) {
  d3.select("body").append("p").text("No mouseID specified in URL.");
} else {
  // Extract mouse number (strip leading letter)
  mouseNumber = mouseID.replace(/^[mf]/i, "");
  
  // Update title and subtitle based on mode.
  if (mode === "activity") {
    d3.select("#chart-title").text(`Activity Levels of Male ${mouseNumber} and Female ${mouseNumber}`);
    d3.select("#subheader").text(`Follow male ${mouseNumber} and female ${mouseNumber} throughout the course of the experiment and watch their activity change.`);
  } else {
    d3.select("#chart-title").text(`Body Temperatures of Male ${mouseNumber} and Female ${mouseNumber}`);
    d3.select("#subheader").text(`Follow male ${mouseNumber} and female ${mouseNumber} throughout the course of the experiment and watch their body temperature change.`);
  }
  
  // Determine CSV files based on mode.
  const maleFile = mode === "activity" ? "data/male_act.csv" : "data/male_temp.csv";
  const femFile = mode === "activity" ? "data/fem_act.csv" : "data/fem_temp.csv";
  
  const maleKey = "m" + mouseNumber;
  const femaleKey = "f" + mouseNumber;
  
  Promise.all([
    d3.csv(maleFile, rowConverter),
    d3.csv(femFile, rowConverter)
  ]).then(([maleDataRaw, femaleDataRaw]) => {
    const maleSeries = maleDataRaw.map((row, i) => ({
      time: d3.timeMinute.offset(experimentStart, i),
      value: +row[maleKey]
    }));
    const femaleSeries = femaleDataRaw.map((row, i) => ({
      time: d3.timeMinute.offset(experimentStart, i),
      value: +row[femaleKey]
    }));
    const windowSize = 15; // minutes.
    smoothedMaleGlobal = smoothSeries(maleSeries, windowSize);
    const smoothedFemale = smoothSeries(femaleSeries, windowSize);
    
    // Split female series into segments by estrus state.
    femaleSegmentsGlobal = [];
    let currentSegment = [];
    let currentEstrus = isEstrus(smoothedFemale[0].time);
    smoothedFemale.forEach(d => {
      const estrusState = isEstrus(d.time);
      if (estrusState !== currentEstrus) {
        if (currentSegment.length > 0) {
          femaleSegmentsGlobal.push({ estrus: currentEstrus, data: currentSegment });
        }
        currentSegment = [d];
        currentEstrus = estrusState;
      } else {
        currentSegment.push(d);
      }
    });
    if (currentSegment.length > 0) {
      femaleSegmentsGlobal.push({ estrus: currentEstrus, data: currentSegment });
    }
    
    const allValues = smoothedMaleGlobal.map(d => d.value)
      .concat(smoothedFemale.map(d => d.value));
    yScale.domain([d3.min(allValues) * 0.98, d3.max(allValues) * 1.02]);
    gYAxis.call(yAxis);
    
    drawLegend();
    
    // Remove any existing brush and disable brush mode during animation.
    svg.select(".brush-group").remove();
    brushDomainActive = false;
    
    startAnimation();
    addScrubOverlay();
  });
}

function rowConverter(d) {
  const converted = {};
  Object.keys(d).forEach(key => { converted[key] = +d[key]; });
  return converted;
}

function isEstrus(time) {
  const diff = time - experimentStart;
  const minutes = diff / (1000 * 60);
  const day = Math.floor(minutes / 1440) + 1;
  return ((day - 2) % 4 === 0);
}

// -----------------------
// Legend drawing.
function drawLegend() {
  const legendDiv = d3.select("#legend");
  legendDiv.html("");
  
  const legendContainer = legendDiv.append("div")
    .attr("class", "legend-container");
  const legendItems = [
    { label: "Male", color: "lightblue", shape: "line" },
    { label: "Female (Estrus)", color: "#d93d5f", shape: "line" },
    { label: "Female (Non-Estrus)", color: "lightpink", shape: "line" }
  ];
  legendItems.forEach(item => {
    const itemDiv = legendContainer.append("div").attr("class", "legend-item");
    if(item.shape === "line"){
      const swatch = itemDiv.append("svg").attr("width",30).attr("height",20);
      swatch.append("line")
        .attr("x1",0)
        .attr("y1",10)
        .attr("x2",30)
        .attr("y2",10)
        .attr("stroke",item.color)
        .attr("stroke-width",2);
    }
    itemDiv.append("span").text(item.label);
  });
  
  const lightsLegendContainer = legendDiv.append("div")
    .attr("class", "legend-container lights-legend");
  const lightsLegendItems = [
    { label: "Lights On", color: "white", shape: "rect" },
    { label: "Lights Off", color: "#e6e6e6", shape: "rect" }
  ];
  lightsLegendItems.forEach(item => {
    const itemDiv = lightsLegendContainer.append("div").attr("class", "legend-item");
    if(item.shape === "rect"){
      const swatch = itemDiv.append("svg").attr("width",30).attr("height",20);
      swatch.append("rect")
        .attr("width",30)
        .attr("height",20)
        .attr("fill",item.color)
        .attr("stroke","#000");
    }
    itemDiv.append("span").text(item.label);
  });
}

// -----------------------
// Update chart for a given simulation time.
// When brush mode is active, filter data using xScale.domain(); otherwise use currentSimTime.
function updateChart(currentTime) {
  if (!brushDomainActive) {
    const fixedWindowEnd = d3.timeMinute.offset(experimentStart, windowDurationMinutes);
    let windowStart, windowEnd;
    if (currentTime < fixedWindowEnd) {
      windowStart = experimentStart;
      windowEnd = fixedWindowEnd;
    } else if (phase === 1) {
      windowEnd = currentTime;
      windowStart = d3.timeMinute.offset(currentTime, -windowDurationMinutes);
    } else {
      windowStart = experimentStart;
      windowEnd = experimentEnd;
    }
    xScale.domain([windowStart, windowEnd]);
  }
  
  if (phase === 1) {
    xAxis.tickValues(getAnimationTickValues(xScale.domain()[0], xScale.domain()[1]))
         .tickFormat(xTickFormat);
  } else {
    xAxis.tickValues(getFinalTickValues(xScale.domain()[0], xScale.domain()[1]))
         .tickFormat(xTickFormat);
  }
  gXAxis.call(xAxis);
  drawBackground();
  
  let filterStart, filterEnd;
  if (brushDomainActive) {
    [filterStart, filterEnd] = xScale.domain();
  } else {
    filterStart = experimentStart;
    filterEnd = currentTime;
  }
  
  // Define tooltip labels based on mode.
  const dataLabel = mode === "activity" ? "Activity" : "Temp";
  const unitLabel = mode === "activity" ? "" : "°C";
  
  const filteredMale = smoothedMaleGlobal.filter(d => d.time >= filterStart && d.time <= filterEnd);
  malePath.datum(filteredMale)
    .attr("d", lineGenerator)
    .on("mousemove", function(event) {
      const mouseTime = xScale.invert(d3.pointer(event)[0]);
      const bisect = d3.bisector(d => d.time).left;
      const idx = bisect(filteredMale, mouseTime);
      const d0 = filteredMale[idx - 1] || filteredMale[0];
      const d1 = filteredMale[idx] || filteredMale[filteredMale.length - 1];
      const dClosest = mouseTime - d0.time < d1.time - mouseTime ? d0 : d1;
      d3.select("#detail-tooltip")
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 15) + "px")
        .html(`Male Mouse ${mouseNumber}<br/>Time: ${d3.timeFormat("%b %d, %H:%M")(dClosest.time)}<br/>${dataLabel}: ${d3.format(".2f")(dClosest.value)}${unitLabel}`)
        .style("display", "block");
    })
    .on("mouseout", () => {
      d3.select("#detail-tooltip").style("display", "none");
    });
  
  femaleLineGroup.selectAll("path").remove();
  femaleSegmentsGlobal.forEach(segment => {
    const filteredSegment = segment.data.filter(d => d.time >= filterStart && d.time <= filterEnd);
    if (filteredSegment.length > 0) {
      femaleLineGroup.append("path")
        .datum(filteredSegment)
        .attr("fill", "none")
        .attr("stroke", segment.estrus ? "#d93d5f" : "pink")
        .attr("stroke-width", 2)
        .attr("d", lineGenerator)
        .on("mousemove", function(event) {
          const mouseTime = xScale.invert(d3.pointer(event)[0]);
          const bisect = d3.bisector(d => d.time).left;
          const idx = bisect(filteredSegment, mouseTime);
          const d0 = filteredSegment[idx - 1] || filteredSegment[0];
          const d1 = filteredSegment[idx] || filteredSegment[filteredSegment.length - 1];
          const dClosest = mouseTime - d0.time < d1.time - mouseTime ? d0 : d1;
          d3.select("#detail-tooltip")
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 15) + "px")
            .html(`Female Mouse ${mouseNumber} ${segment.estrus ? "(Estrus)" : "(Non-Estrus)"}<br/>Time: ${d3.timeFormat("%b %d, %H:%M")(dClosest.time)}<br/>${dataLabel}: ${d3.format(".2f")(dClosest.value)}${unitLabel}`)
            .style("display", "block");
        })
        .on("mouseout", () => {
          d3.select("#detail-tooltip").style("display", "none");
        });
    }
  });
}

// -----------------------
// Animation loop functions.
function runAnimation(startTime) {
  svg.select(".brush-group").remove();
  brushDomainActive = false;
  
  currentSimTime = startTime;
  phase = 1;
  animationTimer = d3.interval(() => {
    currentSimTime = d3.timeMinute.offset(currentSimTime, 20);
    updateNarrative(currentSimTime); // Update the narrative text
    if (currentSimTime > experimentEnd) {
      animationTimer.stop();
      phase = 2;
      updateChart(experimentEnd);
      d3.select("#reset-scope-button").style("display", "block");
    } else {
      updateChart(currentSimTime);
    }
  }, 50);
}

function startAnimation() {
  runAnimation(experimentStart);
}

function resumeAnimation() {
  runAnimation(currentSimTime);
}

function pauseAnimation() {
  if (animationTimer) {
    animationTimer.stop();
    animationTimer = null;
  }
}

// -----------------------
// Pause/Resume button.
d3.select("#pause-button").on("click", () => {
  if (!isPaused) {
    pauseAnimation();
    isPaused = true;
    d3.select("#pause-button").text("Resume");
  } else {
    resumeAnimation();
    isPaused = false;
    d3.select("#pause-button").text("Pause");
  }
});

// -----------------------
// Skip to End button.
function skipToEnd() {
  if (animationTimer) {
    animationTimer.stop();
    animationTimer = null;
  }
  phase = 2;
  currentSimTime = experimentEnd;
  updateNarrative(currentSimTime); 
  updateChart(currentSimTime);
  d3.timeout(() => {
    phase = 2;
    xScale.domain([experimentStart, experimentEnd]);
    gXAxis.transition().duration(1000)
      .call(xAxis.tickValues(getFinalTickValues(xScale.domain()[0], xScale.domain()[1])).tickFormat(xTickFormat));
    drawBackground();
    malePath.datum(smoothedMaleGlobal)
      .transition().duration(1000)
      .attrTween("d", function(d) {
        let previous = d3.select(this).attr("d");
        let current = lineGenerator(d);
        return d3.interpolateString(previous, current);
      });
    femaleLineGroup.selectAll("path").remove();
    femaleSegmentsGlobal.forEach(segment => {
      const path = femaleLineGroup.append("path")
        .datum(segment.data)
        .attr("fill", "none")
        .attr("stroke", segment.estrus ? "#d93d5f" : "lightpink")
        .attr("stroke-width", 2)
        .attr("d", lineGenerator(segment.data.slice(0, 1)));
      path.transition().duration(1000)
          .attrTween("d", function(d) {
            let previous = d3.select(this).attr("d");
            let current = lineGenerator(d);
            return d3.interpolateString(previous, current);
          });
    });
    // Hide pause and skip buttons and show reset scope button.
    d3.select("#pause-button").style("display", "none");
    d3.select("#skip-end-button").style("display", "none");
    d3.select("#reset-scope-button").style("display", "inline-block");
    enableBrush();
  }, 500);

}

d3.select("#skip-end-button").on("click", () => {
  skipToEnd();
});

// -----------------------
// Reset Scope button for brushing.
d3.select("#reset-scope-button").on("click", () => {
  brushDomainActive = false;
  xScale.domain([experimentStart, experimentEnd]);
  gXAxis.transition().duration(750).call(xAxis);
  updateChart(currentSimTime);
});

// -----------------------
// Scrubbing functionality.
function addScrubOverlay() {
  gClip.append("rect")
    .attr("class", "scrub-overlay")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "transparent")
    .style("pointer-events", "all")
    .on("mousedown", scrubStart)
    .on("mousemove", scrubMove)
    .on("mouseup", scrubEnd)
    .on("mouseleave", scrubEnd);
}

function scrubStart(event) {
  isScrubbing = true;
  if (!isPaused) {
    pauseAnimation();
    isPaused = true;
    d3.select("#pause-button").text("Resume");
  }
}

function scrubMove(event) {
  if (isScrubbing) {
    const [x] = d3.pointer(event);
    currentSimTime = fullTimeScale.invert(x);
    updateChart(currentSimTime);
  }
}

function scrubEnd(event) {
  isScrubbing = false;
}

// -----------------------
// Brush for selecting a time scope (only enabled after animation).
let brush = d3.brushX()
  .extent([[0, 0], [width, height]])
  .on("end", brushed);
function enableBrush() {
  if (phase === 2) {
    if (svg.select(".brush-group").empty()) {
      svg.append("g")
         .attr("class", "brush-group")
         .call(brush);
    } else {
      svg.select(".brush-group").call(brush);
    }
  }
}
function brushed(event) {
  if (!event.selection) return;
  brushDomainActive = true;
  const [x0, x1] = event.selection;
  xScale.domain([xScale.invert(x0), xScale.invert(x1)]);
  gXAxis.transition().duration(750).call(xAxis);
  drawBackground();
  updateChart(currentSimTime);
  svg.select(".brush-group").call(brush.move, null);
}

// -----------------------
// Responsive resize.
// Update both width and height based on the container.
function updateDimensions() {
  container = d3.select("#detail-chart").node();
  width = container.clientWidth - margin.left - margin.right;
  height = container.clientHeight - margin.top - margin.bottom;
  d3.select("#detail-chart svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);
  xScale.range([0, width]);
  fullTimeScale.range([0, width]);
  svg.select("#clip rect")
    .attr("width", width)
    .attr("height", height);
  gXAxis.attr("transform", `translate(0, ${height})`);
  svg.select(".x.axis-label")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 10);
  svg.select(".y.axis-label")
    .attr("x", -height / 2)
    .attr("y", -margin.left + 20);
  updateChart(currentSimTime);
}
window.addEventListener("resize", updateDimensions);

// -----------------------
// Reset Animation and Back buttons.
d3.select("#resetBrushDetail").on("click", () => {
  pauseAnimation();
  isPaused = false;
  d3.select("#pause-button").text("Pause").style("display", "inline-block");
  d3.select("#skip-end-button").style("display", "inline-block");
  d3.select("#reset-scope-button").style("display", "none");
  currentSimTime = experimentStart;
  phase = 1;
  svg.select(".brush-group").remove();
  brushDomainActive = false;
  startAnimation();
});
d3.select("#back-button").on("click", () => {
  window.location.href = "advanced.html";
});

// -----------------------
// Home button: redirect to home.html.
document.getElementById("home-button").addEventListener("click", () => {
  window.location.href = "home.html";
});

// Function to update the narrative text based on the current simulation time.
function updateNarrative(currentTime) {
  const dayNumber = Math.floor((currentTime - experimentStart) / (1000 * 60 * 60 * 24)) + 1;
  if (dayNumber > 14) { 
    const maxMaleValue = d3.max(smoothedMaleGlobal, d => d.value);
    const minMaleValue = d3.min(smoothedMaleGlobal, d => d.value);
    const maxFemaleValue = d3.max(femaleSegmentsGlobal.flatMap(segment => segment.data), d => d.value);
    const minFemaleValue = d3.min(femaleSegmentsGlobal.flatMap(segment => segment.data), d => d.value);

    d3.select("#dynamic-narrative").html(`
      </br>
      Currently displaying all data.<br/>
      Maximum ${mode === "activity" ? "activity" : "temperature"} for male mouse ID:${mouseNumber} is ${maxMaleValue.toFixed(2)}${mode === "activity" ? "" : "°C"}.<br/>
      Minimum ${mode === "activity" ? "activity" : "temperature"} for male mouse ID:${mouseNumber} is ${minMaleValue.toFixed(2)}${mode === "activity" ? "" : "°C"}.<br/>
      Maximum ${mode === "activity" ? "activity" : "temperature"} for female mouse ID:${mouseNumber} is ${maxFemaleValue.toFixed(2)}${mode === "activity" ? "" : "°C"}.<br/>
      Minimum ${mode === "activity" ? "activity" : "temperature"} for female mouse ID:${mouseNumber} is ${minFemaleValue.toFixed(2)}${mode === "activity" ? "" : "°C"}.
    `);
  } else {
    const currentDayMaleData = smoothedMaleGlobal.filter(d => {
      const day = Math.floor((d.time - experimentStart) / (1000 * 60 * 60 * 24)) + 1;
      return day === dayNumber;
    });
    const currentDayFemaleData = femaleSegmentsGlobal.flatMap(segment => segment.data).filter(d => {
      const day = Math.floor((d.time - experimentStart) / (1000 * 60 * 60 * 24)) + 1;
      return day === dayNumber;
    });

    const maxMaleValue = d3.max(currentDayMaleData, d => d.value);
    const maxFemaleValue = d3.max(currentDayFemaleData, d => d.value);
    const minMaleValue = d3.min(currentDayMaleData, d => d.value);
    const minFemaleValue = d3.min(currentDayFemaleData, d => d.value);

    const dataLabel = mode === "activity" ? "activity" : "temperature";
    const unitLabel = mode === "activity" ? "" : "°C";

    d3.select("#dynamic-narrative").html(`<br/>
      Day ${dayNumber.toString().padStart(2, '0')}<br/> 
      Current maximum ${dataLabel} from male mouse ID:${mouseNumber} is ${maxMaleValue.toFixed(2)}${unitLabel}.<br/>
      Current minimum ${dataLabel} from male mouse ID:${mouseNumber} is ${minMaleValue.toFixed(2)}${unitLabel}.<br/>
      Current maximum ${dataLabel} from female mouse ID:${mouseNumber} is ${maxFemaleValue.toFixed(2)}${unitLabel}.<br/>
      Current minimum ${dataLabel} from female mouse ID:${mouseNumber} is ${minFemaleValue.toFixed(2)}${unitLabel}.
    `);
  }
  
}

// Append x-axis label
svg.append("text")
  .attr("class", "x axis-label")
  .attr("text-anchor", "middle")
  .attr("x", width / 2)
  .attr("y", height + margin.bottom - 10)
  .text("Day | Time");

// Append y-axis label
const yAxisLabel = svg.append("text")
  .attr("class", "y axis-label")
  .attr("text-anchor", "middle")
  .attr("transform", "rotate(-90)")
  .attr("x", -height / 2)
  .attr("y", -margin.left + 20);

// Update y-axis label based on mode
function updateYAxisLabel() {
  const label = mode === "activity" ? "Activity" : "Temperature (°C)";
  yAxisLabel.text(label);
}

// Call updateYAxisLabel after setting the mode
updateYAxisLabel();
