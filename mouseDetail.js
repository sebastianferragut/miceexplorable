import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// -----------------------
// Set up margins, dimensions, and SVG container.
const margin = { top: 50, right: 30, bottom: 50, left: 60 };
let container = d3.select("#detail-chart").node();
let width = container.clientWidth - margin.left - margin.right;
let height = container.clientHeight - margin.top - margin.bottom;

const svg = d3.select("#detail-chart")
  .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Global variable for the vertical line (added after animation ends)
let verticalLine = null;

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
const gClip = svg.append("g").attr("clip-path", "url(#clip)");
const gBackground = gClip.append("g").attr("class", "background-group");
const gData = gClip.append("g").attr("class", "data-group");

// -----------------------
// Create a new group for the maximum value lines.
const gMaxLines = svg.append("g").attr("class", "max-lines");

// -----------------------
// Create groups for axes (not clipped).
const gXAxis = svg.append("g")
  .attr("class", "x axis")
  .attr("transform", `translate(0, ${height})`);
const gYAxis = svg.append("g")
  .attr("class", "y axis");

let xScale = d3.scaleTime().range([0, width]);
let yScale = d3.scaleLinear().range([height, 0]);

const fullTimeScale = d3.scaleTime()
  .domain([new Date(2023, 0, 1, 0, 0), d3.timeMinute.offset(new Date(2023, 0, 1, 0, 0), 14 * 1440)])
  .range([0, width]);

const experimentStart = new Date(2023, 0, 1, 0, 0);
const experimentDays = 14;
const totalMinutes = experimentDays * 1440;
const experimentEnd = d3.timeMinute.offset(experimentStart, totalMinutes);
xScale.domain([experimentStart, experimentEnd]);

// -----------------------
// Declare global variable "phase" early so it can be used by tick formatters.
// Phase 1: animation phase; Phase 2: final/zoom–out phase.
let phase = 1;

// -----------------------
// Global flag to detect when the brush (interactive panning) is active.
let brushDomainActive = false;

/* 
  NEW drawBackground implementation:
  Instead of coloring based on 6 AM/6 PM transitions, we now alternate every 720 minutes (12 hours).
  The first interval (t=0 to t=720) is "lights off" (gray).
*/
function drawBackground() {
  gBackground.selectAll("rect").remove();
  let current = experimentStart;
  let index = 0;
  while (current < experimentEnd) {
    let next = d3.timeMinute.offset(current, 720);
    if (next > experimentEnd) next = experimentEnd;
    if (index % 2 === 0) {
      gBackground.append("rect")
        .attr("class", "background")
        .attr("x", xScale(current))
        .attr("y", 0)
        .attr("width", xScale(next) - xScale(current))
        .attr("height", height)
        .attr("fill", "#e6e6e6");
    }
    current = next;
    index++;
  }
}

drawBackground();

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
  return d.getHours() === 0 ? `Day ${dayNumber.toString().padStart(2, '0')}` : d3.timeFormat("%H:%M")(d);
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
let mouseNumber;
let currentSimTime = experimentStart;
const windowDurationMinutes = 3 * 1440; // fixed sliding window of 3 days
let animationTimer;
let isPaused = false;
let isScrubbing = false;

const malePath = gData.append("path")
  .attr("class", "male-line")
  .attr("fill", "none")
  .attr("stroke", "lightblue")
  .attr("stroke-width", 2);
const femaleLineGroup = gData.append("g")
  .attr("class", "female-line-group");

const lineGenerator = d3.line()
  .x(d => xScale(d.time))
  .y(d => yScale(d.value))
  .curve(d3.curveMonotoneX);

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
const urlParams = new URLSearchParams(window.location.search);
const mouseID = urlParams.get("mouseID");
const mode = urlParams.get("mode") || "temperature";

if (!mouseID) {
  d3.select("body").append("p").text("No mouseID specified in URL.");
} else {
  mouseNumber = mouseID.replace(/^[mf]/i, "");
  if (mode === "activity") {
    d3.select("#chart-title").text(`Activity Levels of Male ${mouseNumber} and Female ${mouseNumber}`);
    d3.select("#subheader").text(`Follow male ${mouseNumber} and female ${mouseNumber} throughout the course of the experiment and watch their activity change.`);
  } else {
    d3.select("#chart-title").text(`Body Temperatures of Male ${mouseNumber} and Female ${mouseNumber}`);
    d3.select("#subheader").text(`Follow male ${mouseNumber} and female ${mouseNumber} throughout the course of the experiment and watch their body temperature change.`);
  }

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
    // Increase smoothing window for activity mode.
    const windowSize = mode === "activity" ? 25 : 15;
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
    svg.select(".brush-group").remove();
    brushDomainActive = false;

    startAnimation();
    addScrubOverlay(); // used during animation (phase 1)
  });
}

function rowConverter(d) {
  const converted = {};
  Object.keys(d).forEach(key => {
    converted[key] = +d[key];
  });
  return converted;
}

function isEstrus(time) {
  const diff = time - experimentStart;
  const minutes = diff / (1000 * 60);
  const day = Math.floor(minutes / 1440) + 1;
  return ((day - 2) % 4 === 0);
}

function drawLegend() {
  const legendDiv = d3.select("#legend");
  legendDiv.html("");
  const legendContainer = legendDiv.append("div").attr("class", "legend-container");
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
  const maxLegendContainer = legendDiv.append("div").attr("class", "legend-container");
  const maxLegendItems = [
    { label: "Max Male", color: "lightblue", dash: "4,2" },
    { label: "Max Female", color: "#d93d5f", dash: "4,2" }
  ];
  maxLegendItems.forEach(item => {
    const itemDiv = maxLegendContainer.append("div").attr("class", "legend-item");
    const swatch = itemDiv.append("svg").attr("width",30).attr("height",20);
    swatch.append("line")
          .attr("x1",0)
          .attr("y1",10)
          .attr("x2",30)
          .attr("y2",10)
          .attr("stroke", item.color)
          .attr("stroke-width",2)
          .attr("stroke-dasharray", item.dash);
    itemDiv.append("span").text(item.label);
  });
}

function updateChart(currentTime) {
  if (!brushDomainActive) {
    // Shift the sliding window so currentSimTime is at ~60% of the domain width.
    let tentativeStart = d3.timeMinute.offset(currentTime, -0.6 * windowDurationMinutes);
    let windowStart = tentativeStart < experimentStart ? experimentStart : tentativeStart;
    let windowEnd = d3.timeMinute.offset(windowStart, windowDurationMinutes);
    if (windowEnd > experimentEnd) {
      windowEnd = experimentEnd;
      windowStart = d3.timeMinute.offset(windowEnd, -windowDurationMinutes);
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
  
  const dataLabel = mode === "activity" ? "Activity" : "Temperature";
  const unitLabel = mode === "activity" ? "" : "°C";
  
  const filteredMale = smoothedMaleGlobal.filter(d => d.time >= filterStart && d.time <= filterEnd);
  malePath.datum(filteredMale)
    .attr("d", lineGenerator);
  
  femaleLineGroup.selectAll("path").remove();
  femaleSegmentsGlobal.forEach(segment => {
    const filteredSegment = segment.data.filter(d => d.time >= filterStart && d.time <= filterEnd);
    if (filteredSegment.length > 0) {
      femaleLineGroup.append("path")
        .datum(filteredSegment)
        .attr("fill", "none")
        .attr("stroke", segment.estrus ? "#d93d5f" : "lightpink")
        .attr("stroke-width", 2)
        .attr("d", lineGenerator);
    }
  });
  
  const maleDataForMax = smoothedMaleGlobal.filter(d => d.time <= (phase === 1 ? currentSimTime : experimentEnd));
  const femaleDataForMax = femaleSegmentsGlobal.flatMap(segment => segment.data)
                            .filter(d => d.time <= (phase === 1 ? currentSimTime : experimentEnd));
  const maleMax = d3.max(maleDataForMax, d => d.value);
  const femaleMax = d3.max(femaleDataForMax, d => d.value);
  
  gMaxLines.selectAll(".male-max-line")
    .data([maleMax])
    .join("line")
      .attr("class", "male-max-line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", d => yScale(d))
      .attr("y2", d => yScale(d))
      .attr("stroke", "lightblue")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,2");
  
  gMaxLines.selectAll(".female-max-line")
    .data([femaleMax])
    .join("line")
      .attr("class", "female-max-line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", d => yScale(d))
      .attr("y2", d => yScale(d))
      .attr("stroke", "#d93d5f")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,2");
  
  // During phase 1, update tooltips based on the current simulation time.
  if (phase === 1) {
    const maleData = smoothedMaleGlobal.filter(d => d.time <= currentSimTime);
    const lastMale = maleData.length ? maleData[maleData.length - 1] : null;
    const femaleData = femaleSegmentsGlobal.flatMap(segment => segment.data)
                              .filter(d => d.time <= currentSimTime);
    const lastFemale = femaleData.length ? femaleData[femaleData.length - 1] : null;
    
    if (lastMale && lastFemale) {
      const diffMale = lastMale.value - lastFemale.value;
      const diffFemale = lastFemale.value - lastMale.value;
      
      d3.select("#tooltip-male")
        .html(`Male: ${lastMale.value.toFixed(2)} (${diffMale.toFixed(2)})`)
        .style("display", "block");
      d3.select("#tooltip-female")
        .html(`Female: ${lastFemale.value.toFixed(2)} (${diffFemale.toFixed(2)})`)
        .style("display", "block");
      
      const chartRect = container.getBoundingClientRect();
      const maleX = xScale(lastMale.time) + chartRect.left + window.scrollX;
      const maleY = yScale(lastMale.value) + chartRect.top + window.scrollY;
      const femaleX = xScale(lastFemale.time) + chartRect.left + window.scrollX;
      const femaleY = yScale(lastFemale.value) + chartRect.top + window.scrollY;
      
      d3.select("#tooltip-male")
        .style("left", (maleX + 10) + "px")
        .style("top", (maleY - 20) + "px");
      d3.select("#tooltip-female")
        .style("left", (femaleX + 10) + "px")
        .style("top", (femaleY - 20) + "px");
    }
  } else {
    // In phase 2, tooltips and the vertical line are handled via the overlay below.
  }
}

function updateSummary(currentTime) {
  const dataLabel = mode === "activity" ? "Activity" : "Temperature";
  const unitLabel = mode === "activity" ? "" : "°C";
  let maxMale, minMale, maxFemale, minFemale;
  let maxLabel, minLabel;
  
  if (currentTime < experimentEnd) {
    const maleData = smoothedMaleGlobal.filter(d => d.time <= currentTime);
    const femaleData = femaleSegmentsGlobal.flatMap(segment => segment.data)
                              .filter(d => d.time <= currentTime);
    maxMale = d3.max(maleData, d => d.value);
    minMale = d3.min(maleData, d => d.value);
    maxFemale = d3.max(femaleData, d => d.value);
    minFemale = d3.min(femaleData, d => d.value);
    maxLabel = "(current) Maximum";
    minLabel = "(current) Minimum";
  } else {
    maxMale = d3.max(smoothedMaleGlobal, d => d.value);
    minMale = d3.min(smoothedMaleGlobal, d => d.value);
    maxFemale = d3.max(femaleSegmentsGlobal.flatMap(segment => segment.data), d => d.value);
    minFemale = d3.min(femaleSegmentsGlobal.flatMap(segment => segment.data), d => d.value);
    maxLabel = "Maximum";
    minLabel = "Minimum";
  }
  
  const minMaleDisplay = (minMale === null || minMale === undefined) ? (mode === "activity" ? "0" : "N/A") : minMale.toFixed(2) + unitLabel;
  const minFemaleDisplay = (minFemale === null || minFemale === undefined) ? (mode === "activity" ? "0" : "N/A") : minFemale.toFixed(2) + unitLabel;

  let averageRow = "";
  if (currentTime >= experimentEnd) {
    const maleAvg = d3.mean(smoothedMaleGlobal, d => d.value);
    const femaleAvg = d3.mean(femaleSegmentsGlobal.flatMap(segment => segment.data), d => d.value);
    averageRow = `<tr>
        <td>Average</td>
        <td>${maleAvg ? maleAvg.toFixed(2) + unitLabel : "N/A"}</td>
        <td>${femaleAvg ? femaleAvg.toFixed(2) + unitLabel : "N/A"}</td>
      </tr>`;
  }
  
  const tableHTML =
    `<table class="summary-table">
      <tr>
        <th colspan="3">Summary for ${dataLabel} Data (Mouse ID: ${mouseNumber})</th>
      </tr>
      <tr>
        <th></th>
        <th>Male</th>
        <th>Female</th>
      </tr>
      <tr>
        <td>${maxLabel}</td>
        <td>${maxMale ? maxMale.toFixed(2) + unitLabel : "N/A"}</td>
        <td>${maxFemale ? maxFemale.toFixed(2) + unitLabel : "N/A"}</td>
      </tr>
      <tr>
        <td>${minLabel}</td>
        <td>${minMaleDisplay}</td>
        <td>${minFemaleDisplay}</td>
      </tr>
      ${averageRow}
    </table>`;
  
  d3.select("#dynamic-narrative").html(tableHTML);
}

// -----------------------
// FINAL TRANSITION FUNCTION
function transitionToFinal() {
  phase = 2;
  currentSimTime = experimentEnd;
  updateSummary(experimentEnd);
  updateChart(experimentEnd);
  d3.timeout(() => {
    // Reset xScale to full range and transition the x-axis.
    xScale.domain([experimentStart, experimentEnd]);
    gXAxis.transition().duration(1000)
      .call(xAxis.tickValues(getFinalTickValues(xScale.domain()[0], xScale.domain()[1]))
        .tickFormat(xTickFormat));
    drawBackground();
    
    // Transition the male line.
    malePath.datum(smoothedMaleGlobal)
      .transition().duration(1000)
      .attrTween("d", function(d) {
        let previous = d3.select(this).attr("d");
        let current = lineGenerator(d);
        return d3.interpolateString(previous, current);
      });
    
    // Remove existing female paths and transition each segment.
    femaleLineGroup.selectAll("path").remove();
    femaleSegmentsGlobal.forEach(segment => {
      const path = femaleLineGroup.append("path")
        .datum(segment.data)
        .attr("fill", "none")
        .attr("stroke", segment.estrus ? "#d93d5f" : "lightpink")
        .attr("stroke-width", 2)
        // Start with a minimal line.
        .attr("d", lineGenerator(segment.data.slice(0, 1)));
      path.transition().duration(1000)
        .attrTween("d", function(d) {
          let previous = d3.select(this).attr("d");
          let current = lineGenerator(d);
          return d3.interpolateString(previous, current);
        });
    });
    
    // Hide buttons that are no longer needed.
    d3.select("#pause-button").style("display", "none");
    d3.select("#skip-end-button").style("display", "none");
    d3.select("#reset-scope-button").style("display", "none");
    
    updateSummary(experimentEnd);
    // Remove the scrubbing overlay (used during animation) so that it does not block events.
    gClip.selectAll(".scrub-overlay").remove();
    enableBrush();
    attachTooltipEvents();
    
  }, 500);
}

function runAnimation(startTime) {
  svg.select(".brush-group").remove();
  brushDomainActive = false;
  
  currentSimTime = startTime;
  phase = 1;
  // Slow down animation with 100ms intervals.
  animationTimer = d3.interval(() => {
    currentSimTime = d3.timeMinute.offset(currentSimTime, 20);
    updateSummary(currentSimTime);
    updateChart(currentSimTime);
    if (currentSimTime > experimentEnd) {
      animationTimer.stop();
      transitionToFinal();
    }
  }, 100);
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

function skipToEnd() {
  if (animationTimer) {
    animationTimer.stop();
    animationTimer = null;
  }
  transitionToFinal();
}

d3.select("#skip-end-button").on("click", () => {
  skipToEnd();
  // Removed the toggling buttons for tooltips and brushing.
});

// -----------------------
// UPDATED Reset-Scope (Zoom Out) Handler
d3.select("#reset-scope-button").on("click", () => {
  // Since brushing is only enabled in phase 2, we simply reset the xScale domain
  // to the full experiment range and update the chart accordingly.
  if (phase === 2) {
    xScale.domain([experimentStart, experimentEnd]);
    gXAxis.transition().duration(750)
      .call(xAxis.tickValues(getFinalTickValues(xScale.domain()[0], xScale.domain()[1]))
        .tickFormat(xTickFormat));
    drawBackground();
    updateChart(experimentEnd);
    brushDomainActive = false;
    d3.select("#reset-scope-button").style("display", "none");
  }
});

// -----------------------
// RESTART ANIMATION BUTTON
d3.select("#resetBrushDetail").on("click", () => {
  pauseAnimation();
  isPaused = false;
  d3.select("#pause-button").text("Pause").style("display", "inline-block");
  d3.select("#skip-end-button").style("display", "inline-block");
  currentSimTime = experimentStart;
  phase = 1;
  svg.select(".brush-group").remove();
  brushDomainActive = false;
  d3.select("#reset-scope-button").style("display", "none");
  startAnimation();
});

d3.select("#back-button").on("click", () => {
  window.location.href = "advanced.html";
});

document.getElementById("home-button").addEventListener("click", () => {
  window.location.href = "home.html";
});

svg.append("text")
  .attr("class", "x axis-label")
  .attr("text-anchor", "middle")
  .attr("x", width / 2)
  .attr("y", height + margin.bottom - 10)
  .text("Day | Time");

const yAxisLabel = svg.append("text")
  .attr("class", "y axis-label")
  .attr("text-anchor", "middle")
  .attr("transform", "rotate(-90)")
  .attr("x", -height / 2)
  .attr("y", -margin.left + 20);

function updateYAxisLabel() {
  const label = mode === "activity" ? "Activity" : "Temperature (°C)";
  yAxisLabel.text(label);
}
updateYAxisLabel();

// --- Scrubbing overlay for animation phase ---
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
    updateSummary(currentSimTime);
  }
}
function scrubEnd(event) {
  isScrubbing = false;
}

// -----------------------
// Brush for panning.
let brush = d3.brushX()
  .extent([[0, 0], [width, height]])
  .on("end", brushed);
function enableBrush() {
  // Removed removal of any tooltip layer so both features work concurrently.
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
  d3.select("#reset-scope-button").style("display", "block");
}
function updateDimensions() {
  container = d3.select("#detail-chart").node();
  width = container.clientWidth - margin.left - margin.right;
  height = container.clientHeight - margin.top - margin.bottom;
  d3.select("#detail-chart svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
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
  // Update vertical line height if it exists.
  if (verticalLine) {
    verticalLine.attr("y2", height);
  }
  updateChart(currentSimTime);
}
window.addEventListener("resize", updateDimensions);

// -----------------------
// Attach tooltip events (and vertical line) for phase 2.
function attachTooltipEvents() {
  // Try to select the brush overlay.
  let target = svg.select(".brush-group").select(".overlay");
  // If not found, add a dedicated tooltip overlay.
  if (target.empty()) {
    target = gClip.append("rect")
      .attr("class", "tooltip-overlay")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "transparent")
      .style("pointer-events", "all");
  }
  // Create the vertical line if it doesn't exist.
  if (!verticalLine) {
    verticalLine = svg.append("line")
      .attr("class", "vertical-line")
      .attr("y1", 0)
      .attr("y2", height)
      .style("display", "none");
  }
  target
      .on("mousemove.tooltip", function(event) {
         const [x] = d3.pointer(event);
         verticalLine
            .attr("x1", x)
            .attr("x2", x)
            .style("display", "block")
            .raise(); // ensure it appears on top
         const time = xScale.invert(x);
         const nearestMale = getNearestValue(smoothedMaleGlobal, time);
         const nearestFemale = getNearestValue(femaleSegmentsGlobal.flatMap(segment => segment.data), time);
         if (nearestMale && nearestFemale) {
           const chartRect = container.getBoundingClientRect();
           const maleX = xScale(nearestMale.time) + chartRect.left + window.scrollX;
           const maleY = yScale(nearestMale.value) + chartRect.top + window.scrollY;
           const femaleX = xScale(nearestFemale.time) + chartRect.left + window.scrollX;
           const femaleY = yScale(nearestFemale.value) + chartRect.top + window.scrollY;
           d3.select("#tooltip-male")
             .html(`Male: ${nearestMale.value.toFixed(2)}`)
             .style("left", (maleX + 10) + "px")
             .style("top", (maleY - 20) + "px")
             .style("display", "block");
           d3.select("#tooltip-female")
             .html(`Female: ${nearestFemale.value.toFixed(2)}`)
             .style("left", (femaleX + 10) + "px")
             .style("top", (femaleY - 20) + "px")
             .style("display", "block");
         }
      })
      .on("mouseout.tooltip", function(event) {
         d3.select("#tooltip-male").style("display", "none");
         d3.select("#tooltip-female").style("display", "none");
         verticalLine.style("display", "none");
      });
}

// -----------------------
// Helper function for tooltip: returns the nearest value given a time.
function getNearestValue(dataSeries, time) {
  const bisect = d3.bisector(d => d.time).left;
  let index = bisect(dataSeries, time);
  if (index >= dataSeries.length) index = dataSeries.length - 1;
  return dataSeries[index];
}
