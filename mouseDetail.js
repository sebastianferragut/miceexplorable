import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// Set margins and initial dimensions.
const margin = { top: 50, right: 30, bottom: 50, left: 60 };
let container = d3.select("#detail-chart").node();
let width = container.clientWidth - margin.left - margin.right;
let height = 600 - margin.top - margin.bottom; // fixed height for the chart

// Create the SVG container.
const svg = d3.select("#detail-chart")
  .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Create scales.
let xScale = d3.scaleTime().range([0, width]);
let yScale = d3.scaleLinear().range([height, 0]);

// Experiment time boundaries.
const experimentStart = new Date(2023, 0, 1, 0, 0);
const experimentDays = 14;
const totalMinutes = experimentDays * 1440;
const experimentEnd = d3.timeMinute.offset(experimentStart, totalMinutes);
xScale.domain([experimentStart, experimentEnd]);

// Select tooltip element.
const tooltip = d3.select("#detail-tooltip");

// Global brush variable.
let brush = d3.brushX().extent([[0, 0], [width, height]]).on("end", brushed);

// ----- Smoothing function -----
// Applies a moving average with a given window size (in minutes)
function smoothSeries(data, windowSize) {
  return data.map((d, i, arr) => {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(arr.length, i + Math.floor(windowSize / 2) + 1);
    const windowData = arr.slice(start, end).map(e => e.value);
    return { time: d.time, value: d3.mean(windowData) };
  });
}

// ----- Draw the chart -----
// This function draws both the male and female lines along with axes, background,
// brush, tooltip and legends.
function drawChart(maleSeries, femaleSeries) {
  // Apply further smoothing by using a larger window (15 minutes)
  const windowSize = 15;
  const smoothedMale = smoothSeries(maleSeries, windowSize);
  const smoothedFemale = smoothSeries(femaleSeries, windowSize);

  // Split female series into segments based on estrus state.
  let femaleSegments = [];
  let currentSegment = [];
  let currentEstrus = isEstrus(smoothedFemale[0].time);
  smoothedFemale.forEach(d => {
    const estrusState = isEstrus(d.time);
    if (estrusState !== currentEstrus) {
      if (currentSegment.length > 0) {
        femaleSegments.push({ estrus: currentEstrus, data: currentSegment });
      }
      currentSegment = [d];
      currentEstrus = estrusState;
    } else {
      currentSegment.push(d);
    }
  });
  if (currentSegment.length > 0) {
    femaleSegments.push({ estrus: currentEstrus, data: currentSegment });
  }

  // Compute y-domain using both series.
  const allValues = smoothedMale.map(d => d.value)
                      .concat(smoothedFemale.map(d => d.value));
  yScale.domain([d3.min(allValues) * 0.98, d3.max(allValues) * 1.02]);

  // Clear previous drawing.
  svg.selectAll("*").remove();

  // ----- Draw background for light/dark periods -----
  // Assume lights on from 6:00 to 18:00 (white) and lights off (grey).
  for (let day = 0; day < experimentDays; day++) {
    const dayStart = d3.timeDay.offset(experimentStart, day);
    const sixAM = d3.timeHour.offset(dayStart, 6);
    const sixPM = d3.timeHour.offset(dayStart, 18);
    const nextDay = d3.timeDay.offset(dayStart, 1);
    
    // Lights off period: from dayStart to 6AM.
    svg.append("rect")
      .attr("class", "background")
      .attr("x", xScale(dayStart))
      .attr("y", 0)
      .attr("width", xScale(sixAM) - xScale(dayStart))
      .attr("height", height)
      .attr("fill", "#d3d3d3");
    
    // Lights off period: from 6PM to nextDay.
    svg.append("rect")
      .attr("class", "background")
      .attr("x", xScale(sixPM))
      .attr("y", 0)
      .attr("width", xScale(nextDay) - xScale(sixPM))
      .attr("height", height)
      .attr("fill", "#d3d3d3");
  }

  // ----- Axes -----
  const xAxis = d3.axisBottom(xScale)
      .ticks(d3.timeDay.every(1))
      .tickFormat(d3.timeFormat("%b %d"));
  const yAxis = d3.axisLeft(yScale);
  
  svg.append("g")
      .attr("class", "x axis")
      .attr("transform", `translate(0, ${height})`)
      .call(xAxis);
  
  svg.append("g")
      .attr("class", "y axis")
      .call(yAxis);

  // ----- Line generator -----
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.value))
    .curve(d3.curveMonotoneX);

  // ----- Draw male line (blue) with summary tooltip -----  
  svg.append("path")
    .datum(smoothedMale)
    .attr("class", "male-line")
    .attr("fill", "none")
    .attr("stroke", "#3690c0")
    .attr("stroke-width", 2)
    .attr("d", line)
    .on("mousemove", function(event) {
      const mouseTime = xScale.invert(d3.pointer(event)[0]);
      const bisect = d3.bisector(d => d.time).left;
      const idx = bisect(smoothedMale, mouseTime);
      const d0 = smoothedMale[idx - 1] || smoothedMale[0];
      const d1 = smoothedMale[idx] || smoothedMale[smoothedMale.length - 1];
      const dClosest = mouseTime - d0.time < d1.time - mouseTime ? d0 : d1;
      tooltip.style("left", (event.pageX + 15) + "px")
             .style("top", (event.pageY - 15) + "px")
             .html(`Male Mouse ${mouseNumber}<br/>Time: ${d3.timeFormat("%b %d, %H:%M")(dClosest.time)}<br/>Temp: ${d3.format(".2f")(dClosest.value)}°C`);
      tooltip.style("display", "block");
    })
    .on("mouseout", function () {
      tooltip.style("display", "none");
    });
  
  // ----- Draw female segments (red for estrus, orange for non-estrus) with summary tooltip -----
  femaleSegments.forEach(segment => {
    const strokeColor = segment.estrus ? "red" : "orange";
    svg.append("path")
      .datum(segment.data)
      .attr("class", "female-line")
      .attr("fill", "none")
      .attr("stroke", strokeColor)
      .attr("stroke-width", 2)
      .attr("d", line)
      .on("mousemove", function(event) {
        const mouseTime = xScale.invert(d3.pointer(event)[0]);
        const bisect = d3.bisector(d => d.time).left;
        const idx = bisect(segment.data, mouseTime);
        const d0 = segment.data[idx - 1] || segment.data[0];
        const d1 = segment.data[idx] || segment.data[segment.data.length - 1];
        const dClosest = mouseTime - d0.time < d1.time - mouseTime ? d0 : d1;
        tooltip.style("left", (event.pageX + 15) + "px")
               .style("top", (event.pageY - 15) + "px")
               .html(`Female Mouse ${mouseNumber} ${segment.estrus ? "(Estrus)" : "(Non-Estrus)"}<br/>Time: ${d3.timeFormat("%b %d, %H:%M")(dClosest.time)}<br/>Temp: ${d3.format(".2f")(dClosest.value)}°C`);
        tooltip.style("display", "block");
      })
      .on("mouseout", function () {
        tooltip.style("display", "none");
      });
  });

  // ----- Add brush for range selection -----
  svg.append("g")
    .attr("class", "brush")
    .call(brush);

  // ----- Draw the overall legend in the div -----
  drawLegend();

  // ----- Draw lights on/off legend at top right inside the SVG -----
  drawLightsLegend();
}

// ----- Brush callback -----
function brushed(event) {
  if (!event.selection) return;
  const [x0, x1] = event.selection;
  xScale.domain([xScale.invert(x0), xScale.invert(x1)]);
  redrawChart();
  // Clear the brush selection so the frame disappears after zooming in.
  svg.select(".brush").call(brush.move, null);
}

// ----- Reset brush function -----
function resetBrush() {
  xScale.domain([experimentStart, experimentEnd]);
  redrawChart();
}

// ----- Redraw chart on zoom/brush -----
function redrawChart() {
  // Update axes.
  const xAxis = d3.axisBottom(xScale)
      .ticks(d3.timeDay.every(1))
      .tickFormat(d3.timeFormat("%b %d"));
  svg.select(".x.axis")
     .transition()
     .duration(750)
     .call(xAxis);
     
  // Re-draw background.
  redrawBackground();
  
  // Update male and female lines.
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.value))
    .curve(d3.curveMonotoneX);
  
  svg.selectAll(".male-line").attr("d", line);
  svg.selectAll(".female-line").attr("d", line);
}

// Re-draw background (remove and draw fresh)
function redrawBackground() {
  svg.selectAll("rect.background").remove();
  for (let day = 0; day < experimentDays; day++) {
    const dayStart = d3.timeDay.offset(experimentStart, day);
    const sixAM = d3.timeHour.offset(dayStart, 6);
    const sixPM = d3.timeHour.offset(dayStart, 18);
    const nextDay = d3.timeDay.offset(dayStart, 1);
    
    svg.insert("rect", ":first-child")
      .attr("class", "background")
      .attr("x", xScale(dayStart))
      .attr("y", 0)
      .attr("width", xScale(sixAM) - xScale(dayStart))
      .attr("height", height)
      .attr("fill", "#d3d3d3");
      
    svg.insert("rect", ":first-child")
      .attr("class", "background")
      .attr("x", xScale(sixPM))
      .attr("y", 0)
      .attr("width", xScale(nextDay) - xScale(sixPM))
      .attr("height", height)
      .attr("fill", "#d3d3d3");
  }
}

// ----- Helper: Determine estrus state -----
// For a given time, compute the day number and return true if (day - 2) % 4 === 0.
function isEstrus(time) {
  const diff = time - experimentStart;
  const minutes = diff / (1000 * 60);
  const day = Math.floor(minutes / 1440) + 1;
  return ((day - 2) % 4 === 0);
}

// ----- Draw Legend (for male/female) ----- 
function drawLegend() {
  const legendDiv = d3.select("#legend");
  legendDiv.html(""); // Clear previous content.
  
  const legendContainer = legendDiv.append("div")
    .attr("class", "legend-container");
    
  const legendItems = [
    { label: "Male", color: "#3690c0", shape: "line" },
    { label: "Female (Estrus)", color: "red", shape: "line" },
    { label: "Female (Non-Estrus)", color: "orange", shape: "line" }
  ];
  
  legendItems.forEach(item => {
    const itemDiv = legendContainer.append("div").attr("class", "legend-item");
    if (item.shape === "line") {
      const swatch = itemDiv.append("svg")
        .attr("width", 30)
        .attr("height", 20);
      swatch.append("line")
        .attr("x1", 0)
        .attr("y1", 10)
        .attr("x2", 30)
        .attr("y2", 10)
        .attr("stroke", item.color)
        .attr("stroke-width", 2);
    }
    itemDiv.append("span").text(item.label);
  });
}

// ----- Draw Lights On/Off Legend (placed at top right of SVG) -----
function drawLightsLegend() {
  const legendGroup = svg.append("g")
      .attr("class", "lights-legend")
      .attr("transform", `translate(${width - 150}, 10)`);
  // Lights On
  legendGroup.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 20)
      .attr("height", 20)
      .attr("fill", "white")
      .attr("stroke", "#000");
  legendGroup.append("text")
      .attr("x", 25)
      .attr("y", 15)
      .text("Lights On")
      .attr("font-size", "12px")
      .attr("fill", "#333");
  // Lights Off
  legendGroup.append("rect")
      .attr("x", 0)
      .attr("y", 25)
      .attr("width", 20)
      .attr("height", 20)
      .attr("fill", "#d3d3d3")
      .attr("stroke", "#000");
  legendGroup.append("text")
      .attr("x", 25)
      .attr("y", 40)
      .text("Lights Off")
      .attr("font-size", "12px")
      .attr("fill", "#333");
}

// ----- Data Loading -----
// Get the mouseID from the URL query string. (E.g. "m12" or "f1")
const urlParams = new URLSearchParams(window.location.search);
const mouseID = urlParams.get("mouseID");
if (!mouseID) {
  d3.select("body").append("p").text("No mouseID specified in URL.");
} else {
  // Extract numeric part and create keys for both genders.
  const mouseNumber = mouseID.replace(/^[mf]/i, "");
  const maleKey = "m" + mouseNumber;
  const femaleKey = "f" + mouseNumber;
  
  // Update chart title to show the mouse number.
  d3.select("#chart-title").text(`Mouse Detail Chart: Mouse ${mouseNumber}`);
  
  Promise.all([
    d3.csv("data/male_temp.csv", rowConverter),
    d3.csv("data/fem_temp.csv", rowConverter)
  ]).then(([maleDataRaw, femaleDataRaw]) => {
    // Build full time series for the selected mouse.
    const maleSeries = maleDataRaw.map((row, i) => ({
      time: d3.timeMinute.offset(experimentStart, i),
      value: +row[maleKey]
    }));
    const femaleSeries = femaleDataRaw.map((row, i) => ({
      time: d3.timeMinute.offset(experimentStart, i),
      value: +row[femaleKey]
    }));
    drawChart(maleSeries, femaleSeries);
  });
}

// Helper: Row converter.
function rowConverter(d) {
  const converted = {};
  Object.keys(d).forEach(key => {
    converted[key] = +d[key];
  });
  return converted;
}

// ----- Responsive Resize ----- 
function updateDimensions() {
  container = d3.select("#detail-chart").node();
  width = container.clientWidth - margin.left - margin.right;
  d3.select("#detail-chart svg")
    .attr("width", width + margin.left + margin.right);
  xScale.range([0, width]);
  // Update brush extent as well.
  brush.extent([[0, 0], [width, height]]);
  redrawChart();
}
window.addEventListener("resize", updateDimensions);

// ----- Button Event Listeners -----
d3.select("#resetBrushDetail").on("click", resetBrush);
d3.select("#back-button").on("click", () => {
  window.location.href = "home.html";
});
