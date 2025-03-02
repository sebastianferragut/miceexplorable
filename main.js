import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// Data variables
let femaleTempData = [];
let maleTempData = [];
let femaleActData = [];
let maleActData = [];

// Global variables for the summary chart
let summarySvg, summaryXScale, summaryYScale, summaryXAxis, summaryYAxis;
let summaryData, summaryLineGenerator, brush;
let originalXDomain, originalYDomain, summaryYLabel;
let currentChartType = "temp";

// Object for filtering series by gender/type
let selectedFilters = { male: true, estrus: true, "non-estrus": true };

// Tooltip for the summary chart
const summaryTooltip = d3.select("#summary-tooltip");

// Precomputed time array – one Date per minute in a day.
const times = d3.range(1440).map(i => new Date(2023, 0, 1, 0, i));

// For the full-day view, define custom ticks.
const fullDayTicks = [
  new Date(2023, 0, 1, 0, 0),
  new Date(2023, 0, 1, 3, 0),
  new Date(2023, 0, 1, 6, 0),
  new Date(2023, 0, 1, 9, 0),
  new Date(2023, 0, 1, 12, 0),
  new Date(2023, 0, 1, 15, 0),
  new Date(2023, 0, 1, 18, 0),
  new Date(2023, 0, 1, 21, 0),
  new Date(2023, 0, 1, 23, 59)
];

// Custom tick format: if tick is exactly 11:59 pm, show that text.
const customTimeFormat = d => {
  if (d.getHours() === 23 && d.getMinutes() === 59) {
    return "11:59 pm";
  }
  return d3.timeFormat("%-I %p")(d);
};

// -------------------------------------------------
// Data Loading and Processing Functions
// -------------------------------------------------
async function loadTemperatureData(filename, label) {
  let data = [];
  const fileData = await d3.csv(`data/${filename}`);
  
  fileData.forEach((row, i) => {
    if (!data[i]) {
      data[i] = { minute: i + 1 };
    }
    // Assume columns are named like f1, f2... or m1, m2...
    for (let j = 1; j <= 13; j++) {
      data[i][`${label}${j}`] = Number(row[`${label}${j}`]) || NaN;
    }
  });
  return data;
}

async function loadActivityData(filename, label) {
  let data = [];
  const fileData = await d3.csv(`data/${filename}`);
  
  fileData.forEach((row, i) => {
    if (!data[i]) {
      data[i] = { minute: i + 1 };
    }
    for (let j = 1; j <= 13; j++) {
      data[i][`${label}${j}`] = Number(row[`${label}${j}`]) || 0;
    }
  });
  return data;
}

// Process mice data into daily averages.
// For females, split into estrus and non‑estrus series based on day number.
// For males, simply average over days.
function processMiceData(dataset, gender) {
  const miceIDs = Object.keys(dataset[0]).filter(k => k !== "minute" && k !== "minuteIndex");
  return miceIDs.flatMap(mouseID => {
    if (gender === "female") {
      const estrusData = new Array(1440).fill(0);
      const nonEstrusData = new Array(1440).fill(0);
      let estrusDays = 0;
      let nonEstrusDays = 0;
      dataset.forEach((row, idx) => {
        const day = Math.floor(idx / 1440) + 1;
        const minute = idx % 1440;
        // Define estrus: e.g., if (day - 2) mod 4 equals 0.
        const isEstrus = ((day - 2) % 4 === 0);
        if (isEstrus) {
          estrusData[minute] += row[mouseID];
          if (minute === 0) estrusDays++;
        } else {
          nonEstrusData[minute] += row[mouseID];
          if (minute === 0) nonEstrusDays++;
        }
      });
      const entries = [];
      if (estrusDays > 0) {
        entries.push({
          id: `${mouseID}-estrus`,
          gender: "female",
          type: "estrus",
          data: estrusData.map(v => v / estrusDays)
        });
      }
      if (nonEstrusDays > 0) {
        entries.push({
          id: `${mouseID}-nonestrus`,
          gender: "female",
          type: "non-estrus",
          data: nonEstrusData.map(v => v / nonEstrusDays)
        });
      }
      return entries;
    } else { // male
      const dailyData = new Array(1440).fill(0);
      let daysCount = 0;
      dataset.forEach((row, idx) => {
        const minute = idx % 1440;
        dailyData[minute] += row[mouseID];
        if (minute === 0) daysCount++;
      });
      return [{
        id: mouseID,
        gender: "male",
        type: "male",
        data: dailyData.map(v => v / daysCount)
      }];
    }
  });
}

// -------------------------------------------------
// Main Visualization Function: Summary Chart
// -------------------------------------------------
function summaryChart(chartType) {
  currentChartType = chartType; // store the current mode
  
  // Process data into daily averages (temperature or activity) using gender info.
  const maleAvgTempData = processMiceData(maleTempData, "male");
  const femaleAvgTempData = processMiceData(femaleTempData, "female");
  const maleAvgActData = processMiceData(maleActData, "male");
  const femaleAvgActData = processMiceData(femaleActData, "female");

  const margin = { top: 20, right: 30, bottom: 50, left: 50 };
  const containerWidth = 850;
  const containerHeight = 450;
  const width = containerWidth - margin.left - margin.right;
  const height = containerHeight - margin.top - margin.bottom;

  // Choose data based on chart type.
  let allData;
  if (chartType === "temp") {
    allData = [...maleAvgTempData, ...femaleAvgTempData];
    summaryYLabel = "Temperature (°C)";
    summaryYScale = d3.scaleLinear()
      .domain([34, d3.max(allData, d => d3.max(d.data))])
      .range([height, 0]);
  } else if (chartType === "act") {
    allData = [...maleAvgActData, ...femaleAvgActData];
    summaryYLabel = "Activity";
    summaryYScale = d3.scaleLinear()
      .domain([0, d3.max(allData, d => d3.max(d.data))])
      .range([height, 0]);
  }
  
  // Apply filtering based on selected checkboxes.
  summaryData = allData.filter(d => {
    if (d.gender === "male") return selectedFilters.male;
    if (d.gender === "female") {
      if (d.type === "estrus") return selectedFilters.estrus;
      if (d.type === "non-estrus") return selectedFilters["non-estrus"];
    }
    return false;
  });

  // Clear previous chart content from the #summary-chart container.
  d3.select("#summary-chart").selectAll("svg").remove();

  // Create the SVG element inside the #summary-chart container.
  summarySvg = d3.select("#summary-chart")
    .append("svg")
      .attr("width", containerWidth)
      .attr("height", containerHeight)
    .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // Add a clipPath so that lines do not overflow.
  summarySvg.append("defs")
    .append("clipPath")
      .attr("id", "clip")
    .append("rect")
      .attr("width", width)
      .attr("height", height);

  // Create xScale as a time scale for the full day.
  summaryXScale = d3.scaleTime()
    .domain([new Date(2023, 0, 1, 0, 0), new Date(2023, 0, 1, 23, 59)])
    .range([0, width]);

  // Save original domains for resetting later.
  originalXDomain = summaryXScale.domain();
  originalYDomain = summaryYScale.domain();

  // Add x-axis title.
  summarySvg.append("text")
    .attr("class", "x-axis-label")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 10)
    .attr("text-anchor", "middle")
    .text("Time of Day");

  // Draw x-axis with custom full-day ticks.
  summaryXAxis = summarySvg.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(summaryXScale)
      .tickValues(fullDayTicks)
      .tickFormat(customTimeFormat)
    );

  // Draw y-axis.
  summaryYAxis = summarySvg.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(summaryYScale));

  // Add y-axis title.
  summarySvg.append("text")
    .attr("class", "y-axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .text(summaryYLabel);

  // Create a line generator for the chart.
  summaryLineGenerator = d3.line()
    .x((d, i) => summaryXScale(times[i]))
    .y(d => summaryYScale(d))
    .curve(d3.curveMonotoneX);

  // Draw a line for each mouse series.
  summarySvg.selectAll(".mouse-line")
    .data(summaryData)
    .enter()
    .append("path")
      .attr("class", "mouse-line")
      .attr("clip-path", "url(#clip)")
      .attr("fill", "none")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.7)
      .attr("d", d => summaryLineGenerator(d.data))
      .attr("stroke", d => {
        if (d.gender === "male") return "#3690c0";
        if (d.gender === "female") {
          return d.type === "estrus" ? "#ff0000" : "#ffa500";
        }
        return "black";
      })
      .on("mouseover", showSummaryTooltip)
      .on("mousemove", moveSummaryTooltip)
      .on("mouseleave", hideSummaryTooltip);

  // Add a brush to allow zooming into a time range.
  brush = d3.brushX()
    .extent([[0, 0], [width, height]])
    .on("end", brushed);
  summarySvg.append("g")
    .attr("class", "brush")
    .call(brush);
}

// Brush handler: update the scales and re-render the lines.
function brushed(event) {
  if (!event.selection) return;
  const [x0, x1] = event.selection;
  const newXDomain = [summaryXScale.invert(x0), summaryXScale.invert(x1)];
  summaryXScale.domain(newXDomain);

  // Recalculate y domain over the selected time window.
  let yMin = Infinity, yMax = -Infinity;
  summaryData.forEach(d => {
    const startIndex = d3.bisectLeft(times, newXDomain[0]);
    const endIndex = d3.bisectRight(times, newXDomain[1]);
    const subset = d.data.slice(startIndex, endIndex);
    const localMin = d3.min(subset);
    const localMax = d3.max(subset);
    if (localMin < yMin) yMin = localMin;
    if (localMax > yMax) yMax = localMax;
  });
  if (yMin === Infinity || yMax === -Infinity) {
    yMin = originalYDomain[0];
    yMax = originalYDomain[1];
  }
  summaryYScale.domain([yMin, yMax]);

  // Update axes.
  summaryXAxis.transition().duration(500)
    .call(d3.axisBottom(summaryXScale)
      .tickValues(fullDayTicks)
      .tickFormat(customTimeFormat));
  summaryYAxis.transition().duration(500)
    .call(d3.axisLeft(summaryYScale));

  // Update the lines.
  summarySvg.selectAll(".mouse-line")
    .transition().duration(500)
    .attr("d", d => summaryLineGenerator(d.data));

  // Clear the brush selection.
  summarySvg.select(".brush").call(brush.move, null);
}

// Reset brush: restore original domains and re-render the chart.
function resetBrush() {
  summaryXScale.domain(originalXDomain);
  summaryYScale.domain(originalYDomain);
  summaryXAxis.transition().duration(500)
    .call(d3.axisBottom(summaryXScale)
      .tickValues(fullDayTicks)
      .tickFormat(customTimeFormat));
  summaryYAxis.transition().duration(500)
    .call(d3.axisLeft(summaryYScale));
  summarySvg.selectAll(".mouse-line")
    .transition().duration(500)
    .attr("d", d => summaryLineGenerator(d.data));
}

// -------------------------------------------------
// Tooltip Functions for the Summary Chart
// -------------------------------------------------
function showSummaryTooltip(event, d) {
  // Highlight the hovered line and de-emphasize others.
  d3.selectAll(".mouse-line")
    .filter(dd => dd.id === d.id)
    .attr("opacity", 1)
    .attr("stroke-width", 2.5);
  d3.selectAll(".mouse-line")
    .filter(dd => dd.id !== d.id)
    .attr("opacity", 0.1);
  
  // Build tooltip content with Mouse ID, Gender and Estrus (if applicable)
  let tooltipContent = `<dt>Mouse ID</dt><dd>${d.id}</dd>`;
  tooltipContent += `<dt>Gender</dt><dd>${d.gender === "male" ? "Male" : "Female"}</dd>`;
  if (d.gender === "female") {
    tooltipContent += `<dt>Estrus Status</dt><dd>${d.type === "estrus" ? "Yes" : "No"}</dd>`;
  }
  summaryTooltip.html(tooltipContent);
  
  // Get cursor coordinates relative to the document body
  const [x, y] = d3.pointer(event, document.body);
  summaryTooltip
    .style("visibility", "visible")
    .style("opacity", 0.8)
    .style("left", `${x + 15}px`)
    .style("top", `${y - 15}px`);
}

function moveSummaryTooltip(event) {
  // Update tooltip position as the mouse moves
  const [x, y] = d3.pointer(event, document.body);
  summaryTooltip
    .style("left", `${x + 15}px`)
    .style("top", `${y - 15}px`);
}

function hideSummaryTooltip() {
  // Reset the line styling on mouse leave and hide the tooltip
  d3.selectAll(".mouse-line")
    .attr("opacity", 0.7)
    .attr("stroke-width", 1.5);
  summaryTooltip.style("visibility", "hidden");
}

// -------------------------------------------------
// Main Handler: Load Data and Wire Up Events
// -------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Load CSV data using "f" for females and "m" for males.
  const femaleLabel = "f";
  const maleLabel = "m";

  maleTempData = await loadTemperatureData("male_temp.csv", maleLabel);
  femaleTempData = await loadTemperatureData("fem_temp.csv", femaleLabel);
  maleActData = await loadActivityData("male_act.csv", maleLabel);
  femaleActData = await loadActivityData("fem_act.csv", femaleLabel);

  console.log("maleActData", maleActData);
  console.log("femaleActData", femaleActData);

  // Render the general summary chart in temperature mode initially.
  summaryChart("temp");

  // Set up event listeners for the Temperature and Activity buttons.
  d3.select("#temp-button").on("click", () => {
    summaryChart("temp");
  });
  d3.select("#activity-button").on("click", () => {
    summaryChart("act");
  });

  // Wire up the reset brush button.
  d3.select("#resetBrush").on("click", resetBrush);

  // Set up event listeners for the filtering checkboxes.
  d3.select("#maleCheckbox").on("change", function() {
    selectedFilters.male = this.checked;
    summaryChart(currentChartType);
  });
  d3.select("#estrusCheckbox").on("change", function() {
    selectedFilters.estrus = this.checked;
    summaryChart(currentChartType);
  });
  d3.select("#nonEstrusCheckbox").on("change", function() {
    selectedFilters["non-estrus"] = this.checked;
    summaryChart(currentChartType);
  });
});


