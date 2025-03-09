import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const margin = {top: 50, right: 30, bottom: 50, left: 60};
let width = 960 - margin.left - margin.right;
let height = 500 - margin.top - margin.bottom;

const experimentStart = new Date(2023, 0, 1, 0, 0);
const experimentDays = 14;
const totalMinutes = experimentDays * 1440;
const experimentEnd = d3.timeMinute.offset(experimentStart, totalMinutes);

// Create the SVG container.
const svg = d3.select("#detail-chart")
  .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Get mouseID from URL query string.
const urlParams = new URLSearchParams(window.location.search);
const mouseID = urlParams.get("mouseID");

if (!mouseID) {
  d3.select("body").append("p").text("No mouseID specified in URL.");
} else {
  d3.select("#chart-title").text(`Mouse Detail Chart: Mouse ${mouseID}`);
  
  // Load the CSV files.
  Promise.all([
    d3.csv("data/male_temp.csv", rowConverter),
    d3.csv("data/fem_temp.csv", rowConverter)
  ]).then(([maleDataRaw, femaleDataRaw]) => {
    // Build full time series for the selected mouse.
    const maleSeries = maleDataRaw.map((row, i) => {
      return { time: d3.timeMinute.offset(experimentStart, i), value: +row[mouseID] };
    });
    const femaleSeriesRaw = femaleDataRaw.map((row, i) => {
      return { time: d3.timeMinute.offset(experimentStart, i), value: +row[mouseID] };
    });
    
    // For the female series, split the data into segments based on estrus state.
    const femaleSegments = [];
    let currentSegment = [];
    let currentEstrus = isEstrus(0);
    for (let i = 0; i < femaleSeriesRaw.length; i++) {
      const d = femaleSeriesRaw[i];
      const estrusState = isEstrus(i);
      if (estrusState !== currentEstrus) {
        if (currentSegment.length > 0) {
          femaleSegments.push({ estrus: currentEstrus, data: currentSegment });
        }
        currentSegment = [d];
        currentEstrus = estrusState;
      } else {
        currentSegment.push(d);
      }
    }
    if (currentSegment.length > 0) {
      femaleSegments.push({ estrus: currentEstrus, data: currentSegment });
    }
    
    // Compute y-domain from both series.
    const maleValues = maleSeries.map(d => d.value);
    const femaleValues = femaleSeriesRaw.map(d => d.value);
    const allValues = maleValues.concat(femaleValues);
    const yDomain = [d3.min(allValues), d3.max(allValues)];
    
    const xScale = d3.scaleTime()
      .domain([experimentStart, experimentEnd])
      .range([0, width]);
    
    const yScale = d3.scaleLinear()
      .domain([yDomain[0] * 0.98, yDomain[1] * 1.02])
      .range([height, 0]);
    
    // Draw background rectangles for light/dark periods.
    // Assume lights on from 6:00 to 18:00; dark otherwise.
    for (let day = 0; day < experimentDays; day++) {
      const dayStart = d3.timeDay.offset(experimentStart, day);
      const sixAM = d3.timeHour.offset(dayStart, 6);
      const sixPM = d3.timeHour.offset(dayStart, 18);
      const nextDay = d3.timeDay.offset(dayStart, 1);
      
      // Dark period from dayStart to 6AM.
      svg.append("rect")
        .attr("x", xScale(dayStart))
        .attr("y", 0)
        .attr("width", xScale(sixAM) - xScale(dayStart))
        .attr("height", height)
        .attr("fill", "rgba(0,0,0,0.1)");
      
      // Dark period from 6PM to nextDay.
      svg.append("rect")
        .attr("x", xScale(sixPM))
        .attr("y", 0)
        .attr("width", xScale(nextDay) - xScale(sixPM))
        .attr("height", height)
        .attr("fill", "rgba(0,0,0,0.1)");
    }
    
    // Add x and y axes.
    const xAxis = d3.axisBottom(xScale)
      .ticks(d3.timeDay.every(1))
      .tickFormat(d3.timeFormat("%b %d"));
    const yAxis = d3.axisLeft(yScale);
    
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis);
    
    svg.append("g")
      .call(yAxis);
    
    // Define a line generator.
    const line = d3.line()
      .x(d => xScale(d.time))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);
    
    // Draw the male line in blue.
    svg.append("path")
      .datum(maleSeries)
      .attr("fill", "none")
      .attr("stroke", "#3690c0")
      .attr("stroke-width", 2)
      .attr("d", line);
    
    // Draw the female line segments.
    // Use red for non-estrus and orange for estrus.
    femaleSegments.forEach(segment => {
      svg.append("path")
        .datum(segment.data)
        .attr("fill", "none")
        .attr("stroke", segment.estrus ? "orange" : "red")
        .attr("stroke-width", 2)
        .attr("d", line);
    });
  });
}

// Helper: rowConverter for CSV rows.
function rowConverter(d) {
  const converted = {};
  Object.keys(d).forEach(key => {
    converted[key] = +d[key];
  });
  return converted;
}

// Helper: Determines if the given row index corresponds to an estrus day.
// Estrus if (day - 2) % 4 === 0.
function isEstrus(index) {
  const day = Math.floor(index / 1440) + 1;
  return ((day - 2) % 4 === 0);
}

// Back button: return to the main overview.
d3.select("#back-button").on("click", () => {
  window.location.href = "index.html";
});
