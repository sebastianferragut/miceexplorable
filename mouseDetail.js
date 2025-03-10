import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// -----------------------
// Set up margins, dimensions, and SVG container.
const margin = { top: 50, right: 30, bottom: 50, left: 60 };
let container = d3.select("#detail-chart").node();
let width = container.clientWidth - margin.left - margin.right;
let height = 600 - margin.top - margin.bottom;

// Main SVG and group translated by margins.
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

// A constant full–timeline scale used for scrubbing.
const fullTimeScale = d3.scaleTime()
    .domain([new Date(2023, 0, 1, 0, 0), d3.timeMinute.offset(new Date(2023, 0, 1, 0, 0), 14*1440)])
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
// Custom Tick Functions.
// During animation (phase 1): ticks every day and every 3 hours.
function getAnimationTickValues(start, end) {
  let ticks = d3.timeHour.every(3).range(start, end);
  let dayTicks = d3.timeDay.every(1).range(start, end);
  ticks = d3.merge([ticks, dayTicks]);
  ticks.sort((a, b) => a - b);
  return ticks;
}
// Final state (phase 2): ticks at every day (midnight) and at 12:00 PM.
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
// Tick formatter changes with phase.
function xTickFormat(d) {
  if (phase === 1) {
    if (d.getHours() === 0) return d3.timeFormat("%b %d")(d);
    return d3.timeFormat("%-I %p")(d);
  } else {
    if (d.getHours() === 0) return d3.timeFormat("%b %d")(d);
    else if (d.getHours() === 12) return "12 PM";
    else return "";
  }
}

// The xAxis will be updated with different tick values later.
let xAxis = d3.axisBottom(xScale)
    .tickValues(getAnimationTickValues(xScale.domain()[0], xScale.domain()[1]))
    .tickFormat(xTickFormat);
let yAxis = d3.axisLeft(yScale);

// Append initial axes.
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
  .attr("stroke", "#3690c0")
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
    
    // Lights off: from dayStart to 6AM.
    gBackground.append("rect")
      .attr("class", "background")
      .attr("x", xScale(dayStart))
      .attr("y", 0)
      .attr("width", xScale(sixAM) - xScale(dayStart))
      .attr("height", height)
      .attr("fill", "#d3d3d3");
    
    // Lights off: from 6PM to nextDay.
    gBackground.append("rect")
      .attr("class", "background")
      .attr("x", xScale(sixPM))
      .attr("y", 0)
      .attr("width", xScale(nextDay) - xScale(sixPM))
      .attr("height", height)
      .attr("fill", "#d3d3d3");
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
const urlParams = new URLSearchParams(window.location.search);
const mouseID = urlParams.get("mouseID");
if (!mouseID) {
  d3.select("body").append("p").text("No mouseID specified in URL.");
} else {
  mouseNumber = mouseID.replace(/^[mf]/i, "");
  const maleKey = "m" + mouseNumber;
  const femaleKey = "f" + mouseNumber;
  
  d3.select("#chart-title").text(`Mouse Detail Chart: Mouse ${mouseNumber}`);
  
  Promise.all([
    d3.csv("data/male_temp.csv", rowConverter),
    d3.csv("data/fem_temp.csv", rowConverter)
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
    
    // Set yScale domain.
    const allValues = smoothedMaleGlobal.map(d => d.value)
      .concat(smoothedFemale.map(d => d.value));
    yScale.domain([d3.min(allValues)*0.98, d3.max(allValues)*1.02]);
    gYAxis.call(yAxis);
    
    // Draw legends.
    drawLegend();
    
    // Start the animation.
    startAnimation();
    
    // Enable scrubbing over the chart.
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
  const minutes = diff/(1000*60);
  const day = Math.floor(minutes/1440)+1;
  return ((day-2)%4===0);
}

// -----------------------
// Legend drawing: mouse lines then lights.
function drawLegend() {
  const legendDiv = d3.select("#legend");
  legendDiv.html(""); // clear previous content
  
  // Legend for mouse lines.
  const legendContainer = legendDiv.append("div")
    .attr("class", "legend-container");
  const legendItems = [
    { label: "Male", color: "#3690c0", shape: "line" },
    { label: "Female (Estrus)", color: "red", shape: "line" },
    { label: "Female (Non-Estrus)", color: "orange", shape: "line" }
  ];
  legendItems.forEach(item => {
    const itemDiv = legendContainer.append("div").attr("class", "legend-item");
    if(item.shape==="line"){
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
  
  // Legend for lights.
  const lightsLegendContainer = legendDiv.append("div")
    .attr("class", "legend-container lights-legend");
  const lightsLegendItems = [
    { label: "Lights On", color: "white", shape: "rect" },
    { label: "Lights Off", color: "#d3d3d3", shape: "rect" }
  ];
  lightsLegendItems.forEach(item => {
    const itemDiv = lightsLegendContainer.append("div").attr("class", "legend-item");
    if(item.shape==="rect"){
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
// Update the chart for a given simulated time.
function updateChart(currentTime) {
  let windowStart, windowEnd;
  const fixedWindowEnd = d3.timeMinute.offset(experimentStart, windowDurationMinutes);
  if(currentTime < fixedWindowEnd){
    windowStart = experimentStart;
    windowEnd = fixedWindowEnd;
  } else if(phase === 1){
    windowEnd = currentTime;
    windowStart = d3.timeMinute.offset(currentTime, -windowDurationMinutes);
  } else {
    windowStart = experimentStart;
    windowEnd = experimentEnd;
  }
  xScale.domain([windowStart, windowEnd]);
  
  // Update ticks based on phase.
  if(phase === 1){
    xAxis.tickValues(getAnimationTickValues(xScale.domain()[0], xScale.domain()[1]))
         .tickFormat(xTickFormat);
  } else {
    xAxis.tickValues(getFinalTickValues(xScale.domain()[0], xScale.domain()[1]))
         .tickFormat(xTickFormat);
  }
  gXAxis.call(xAxis);
  drawBackground();
  
  // Update male line.
  const filteredMale = smoothedMaleGlobal.filter(d => d.time <= currentTime);
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
        .style("left", (event.pageX+15)+"px")
        .style("top", (event.pageY-15)+"px")
        .html(`Male Mouse ${mouseNumber}<br/>Time: ${d3.timeFormat("%b %d, %H:%M")(dClosest.time)}<br/>Temp: ${d3.format(".2f")(dClosest.value)}°C`)
        .style("display", "block");
    })
    .on("mouseout", () => {
      d3.select("#detail-tooltip").style("display", "none");
    });
  
  // Update female segments.
  femaleLineGroup.selectAll("path").remove();
  femaleSegmentsGlobal.forEach(segment => {
    const filteredSegment = segment.data.filter(d => d.time <= currentTime);
    if(filteredSegment.length > 0){
      femaleLineGroup.append("path")
        .datum(filteredSegment)
        .attr("fill", "none")
        .attr("stroke", segment.estrus ? "red" : "orange")
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
            .style("left", (event.pageX+15)+"px")
            .style("top", (event.pageY-15)+"px")
            .html(`Female Mouse ${mouseNumber} ${segment.estrus?"(Estrus)":"(Non-Estrus)"}<br/>Time: ${d3.timeFormat("%b %d, %H:%M")(dClosest.time)}<br/>Temp: ${d3.format(".2f")(dClosest.value)}°C`)
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
  currentSimTime = startTime;
  phase = 1;
  animationTimer = d3.interval(() => {
    currentSimTime = d3.timeMinute.offset(currentSimTime, 20); // 20-minute increment per tick
    if(currentSimTime > experimentEnd){
      phase = 2;
      currentSimTime = experimentEnd;
      updateChart(currentSimTime);
      animationTimer.stop();
      // After a brief pause, perform a smooth zoom-out.
      d3.timeout(() => {
        phase = 2;
        xScale.domain([experimentStart, experimentEnd]);
        gXAxis.transition().duration(1000)
          .call(xAxis.tickValues(getFinalTickValues(xScale.domain()[0], xScale.domain()[1])).tickFormat(xTickFormat));
        drawBackground();
        // Smooth transition for male line.
        malePath.datum(smoothedMaleGlobal)
          .transition().duration(1000)
          .attrTween("d", function(d) {
            let previous = d3.select(this).attr("d");
            let current = lineGenerator(d);
            return d3.interpolateString(previous, current);
          });
        // Smooth transition for female segments.
        femaleLineGroup.selectAll("path").remove();
        femaleSegmentsGlobal.forEach(segment => {
          const path = femaleLineGroup.append("path")
            .datum(segment.data)
            .attr("fill", "none")
            .attr("stroke", segment.estrus ? "red" : "orange")
            .attr("stroke-width", 2)
            .attr("d", lineGenerator(segment.data.slice(0,1)));
          path.transition().duration(1000)
              .attrTween("d", function(d) {
                let previous = d3.select(this).attr("d");
                let current = lineGenerator(d);
                return d3.interpolateString(previous, current);
              });
        });
        // Enable brush (panning) after zoom–out.
        enableBrush();
      }, 500);
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
  if(animationTimer) {
    animationTimer.stop();
    animationTimer = null;
  }
}

// -----------------------
// Pause/Resume button.
d3.select("#pause-button").on("click", () => {
  if(!isPaused) {
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
// Scrubbing functionality.
function addScrubOverlay() {
  // Append a transparent rect to capture mouse events.
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
  // If animation is running, pause it.
  if(!isPaused) {
    pauseAnimation();
    isPaused = true;
    d3.select("#pause-button").text("Resume");
  }
}

function scrubMove(event) {
  if(isScrubbing) {
    // Use fullTimeScale so scrubbing maps across the entire experiment.
    const [x] = d3.pointer(event);
    currentSimTime = fullTimeScale.invert(x);
    updateChart(currentSimTime);
  }
}

function scrubEnd(event) {
  isScrubbing = false;
}

// -----------------------
// Brush for selecting a scope of time (enabled after zoom–out).
let brush = d3.brushX()
  .extent([[0, 0], [width, height]])
  .on("end", brushed);
function enableBrush() {
  // Append brush group if not already.
  if(svg.select(".brush-group").empty()){
    svg.append("g")
       .attr("class", "brush-group")
       .call(brush);
  } else {
    svg.select(".brush-group").call(brush);
  }
}
function brushed(event) {
  if(!event.selection) return;
  const [x0, x1] = event.selection;
  xScale.domain([xScale.invert(x0), xScale.invert(x1)]);
  gXAxis.transition().duration(750).call(xAxis);
  // Redraw background and data.
  drawBackground();
  updateChart(currentSimTime);
  // Remove brush selection.
  svg.select(".brush-group").call(brush.move, null);
}

// -----------------------
// Responsive resize.
function updateDimensions() {
  container = d3.select("#detail-chart").node();
  width = container.clientWidth - margin.left - margin.right;
  d3.select("#detail-chart svg")
    .attr("width", width + margin.left + margin.right);
  xScale.range([0, width]);
  fullTimeScale.range([0, width]);
  svg.select("#clip rect").attr("width", width);
  gXAxis.attr("transform", `translate(0, ${height})`);
  updateChart(currentSimTime);
}
window.addEventListener("resize", updateDimensions);

// -----------------------
// Reset button and back button.
d3.select("#resetBrushDetail").on("click", () => {
  pauseAnimation();
  isPaused = false;
  d3.select("#pause-button").text("Pause");
  currentSimTime = experimentStart;
  phase = 1;
  startAnimation();
});
d3.select("#back-button").on("click", () => {
  window.location.href = "home.html";
});
