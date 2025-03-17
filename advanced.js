import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// ------------------------
// Advanced Chart Code (Temperature and Activity)
// ------------------------

let currentMode = "temperature";
let allData = [];
let aggregatedMale, aggregatedFemaleEstrus, aggregatedFemaleNonEstrus;
let expandedGroups = { male: false, estrus: false, "non-estrus": false };
let selectedFilters = { male: true, estrus: true, "non-estrus": true };

const margin = { top: 30, right: 30, bottom: 60, left: 60 };
let width, height;
let svg, xScale, yScale, xAxis, yAxis;
let originalXDomain, originalYDomain;
let constantXScale;
let brush;

const tooltip = d3.select("#advanced-chart")
  .append("div")
    .attr("id", "tooltip");

const LIGHTS_OFF_COLOR = "rgba(0, 0, 0, 0.1)";
let globalYDomain;
const SMOOTH_WINDOW = 5;
const times = d3.range(1440).map(i => new Date(2023, 0, 1, 0, i));
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
const customTimeFormat = d => {
  if (d.getHours() === 23 && d.getMinutes() === 59) return "11:59 pm";
  return d3.timeFormat("%-I %p")(d);
};

function getContainerDimensions() {
  const container = d3.select("#advanced-chart").node();
  let h = container.clientHeight;
  if (h < 100) h = 500;
  return { width: container.clientWidth, height: h };
}

function updatePageTitle() {
  if (currentMode === "temperature") {
    document.querySelector("h1").textContent = "Average Daily Cycle of Body Temperature of Mice";
    document.title = "Advanced Chart - Body Temperature";
    updateNarrativeText(currentMode);
  } else {
    document.querySelector("h1").textContent = "Average Daily Cycle of Activity of Mice";
    document.title = "Advanced Chart - Activity";
    updateNarrativeText(currentMode);
  }
}

function updateDimensions() {
  const dims = getContainerDimensions();
  width = dims.width - margin.left - margin.right;
  height = dims.height - margin.top - margin.bottom;
  
  d3.select("#advanced-chart svg")
    .attr("width", dims.width)
    .attr("height", dims.height);
  
  xScale.range([0, width]);
  yScale.range([height, 0]);
  
  xAxis.attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickValues(fullDayTicks)
      .tickFormat(customTimeFormat)
    );
  yAxis.call(d3.axisLeft(yScale));
  
  d3.select("#clip rect")
    .attr("width", width)
    .attr("height", height);
  
  svg.select("rect.background")
    .attr("width", width)
    .attr("height", height);
  
  d3.select(".lightOnLabel")
    .attr("x", constantXScale(new Date(2023, 0, 1, 6, 0)));
  d3.select(".lightOffLabel")
    .attr("x", constantXScale(new Date(2023, 0, 1, 18, 0)));
  
  d3.select(".x-axis-label")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 10);
  d3.select(".y-axis-label")
    .attr("x", -height / 2)
    .attr("y", -margin.left + 15);
  
  svg.select(".brush")
    .call(brush.extent([[0, 0], [width, height]]).on("end", brushed));
  
  updateBackground();
  updateChart();
}

async function loadData() {
  updatePageTitle();
  let maleFile, femFile;
  if (currentMode === "temperature") {
    maleFile = "data/male_temp.csv";
    femFile = "data/fem_temp.csv";
  } else {
    maleFile = "data/male_act.csv";
    femFile = "data/fem_act.csv";
  }
  
  const [maleCSV, femCSV] = await Promise.all([
    d3.csv(maleFile, rowConverter),
    d3.csv(femFile, rowConverter)
  ]);
  
  allData = [
    ...processMiceData(maleCSV, "male"),
    ...processMiceData(femCSV, "female")
  ];
  
  const allValues = allData.flatMap(d => d.data);
  globalYDomain = [d3.min(allValues), d3.max(allValues)];
  
  const maleData = allData.filter(d => d.gender === "male");
  const femaleEstrusData = allData.filter(d => d.gender === "female" && d.type === "estrus");
  const femaleNonEstrusData = allData.filter(d => d.gender === "female" && d.type === "non-estrus");
  
  aggregatedMale = { id: "male_avg", gender: "male", type: "male", data: computeAggregatedLine(maleData) };
  aggregatedFemaleEstrus = { id: "female_estrus_avg", gender: "female", type: "estrus", data: computeAggregatedLine(femaleEstrusData) };
  aggregatedFemaleNonEstrus = { id: "female_non-estrus_avg", gender: "female", type: "non-estrus", data: computeAggregatedLine(femaleNonEstrusData) };
  
  initializeChart();
  updateChart();
}

function rowConverter(d) {
  const converted = {};
  Object.keys(d).forEach(key => { converted[key] = +d[key]; });
  return converted;
}

function processMiceData(dataset, gender) {
  const miceIDs = Object.keys(dataset[0]).filter(k => k !== "minuteIndex");
  return miceIDs.flatMap(mouseID => {
    const dataArr = new Array(1440).fill(0);
    let daysCount = 0;
    dataset.forEach((row, idx) => {
      const minute = idx % 1440;
      dataArr[minute] += row[mouseID];
      if (minute === 0) daysCount++;
    });
    const avgData = dataArr.map(v => v / daysCount);
    if (gender === "female") {
      let estrusData = new Array(1440).fill(0);
      let nonEstrusData = new Array(1440).fill(0);
      let estrusDays = 0, nonEstrusDays = 0;
      dataset.forEach((row, idx) => {
        const day = Math.floor(idx / 1440) + 1;
        const minute = idx % 1440;
        const isEstrus = ((day - 2) % 4 === 0);
        if (isEstrus) {
          estrusData[minute] += row[mouseID];
          if (minute === 0) estrusDays++;
        } else {
          nonEstrusData[minute] += row[mouseID];
          if (minute === 0) nonEstrusDays++;
        }
      });
      const result = [];
      if (estrusDays > 0) {
        result.push({ id: mouseID, gender, type: "estrus", data: estrusData.map(v => v/estrusDays) });
      }
      if (nonEstrusDays > 0) {
        result.push({ id: mouseID, gender, type: "non-estrus", data: nonEstrusData.map(v => v/nonEstrusDays) });
      }
      return result;
    } else {
      return [{ id: mouseID, gender, type: "male", data: avgData }];
    }
  });
}

function computeAggregatedLine(dataArray) {
  const count = dataArray.length;
  const aggregated = new Array(1440).fill(0);
  dataArray.forEach(d => {
    d.data.forEach((value, i) => {
      aggregated[i] += value;
    });
  });
  return aggregated.map(v => v / count);
}

function smoothData(dataArray, window_size) {
  return dataArray.map(entry => ({
    id: entry.id,
    gender: entry.gender,
    type: entry.type,
    data: entry.data.map((_, i, arr) => {
      const start = Math.max(0, i - Math.floor(window_size / 2));
      const end = Math.min(arr.length, i + Math.floor(window_size / 2) + 1);
      return d3.mean(arr.slice(start, end));
    })
  }));
}

function getChartData() {
  let chartData = [];
  const maleData = allData.filter(d => d.gender === "male");
  const femaleEstrusData = allData.filter(d => d.gender === "female" && d.type === "estrus");
  const femaleNonEstrusData = allData.filter(d => d.gender === "female" && d.type === "non-estrus");
  
  if (selectedFilters.male) {
    if (!expandedGroups.male) chartData.push(aggregatedMale);
    else chartData.push(...maleData);
  }
  if (selectedFilters.estrus) {
    if (!expandedGroups.estrus) chartData.push(aggregatedFemaleEstrus);
    else chartData.push(...femaleEstrusData);
  }
  if (selectedFilters["non-estrus"]) {
    if (!expandedGroups["non-estrus"]) chartData.push(aggregatedFemaleNonEstrus);
    else chartData.push(...femaleNonEstrusData);
  }
  return chartData;
}

function initializeChart() {
  const dims = getContainerDimensions();
  width = dims.width - margin.left - margin.right;
  height = dims.height - margin.top - margin.bottom;
  
  svg = d3.select("#advanced-chart")
    .append("svg")
      .attr("width", dims.width)
      .attr("height", dims.height)
    .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
  
  svg.append("defs")
    .append("clipPath")
      .attr("id", "clip")
    .append("rect")
      .attr("width", width)
      .attr("height", height);
  
  xScale = d3.scaleTime()
    .domain([new Date(2023,0,1,0,0), new Date(2023,0,1,23,59)])
    .range([0, width]);
  
  yScale = d3.scaleLinear()
    .domain([globalYDomain[0]*0.98, globalYDomain[1]*1.02])
    .range([height, 0]);
  
  originalXDomain = xScale.domain();
  originalYDomain = yScale.domain();
  
  constantXScale = d3.scaleTime()
    .domain(originalXDomain)
    .range([0, width]);
  
  svg.append("rect")
    .attr("class", "background")
    .attr("y", 0)
    .attr("height", height)
    .attr("fill", LIGHTS_OFF_COLOR);
  
  svg.append("text")
    .attr("class", "lightOnLabel")
    .attr("x", constantXScale(new Date(2023,0,1,6,0)))
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", "#333")
    .style("font-size", "16px");
    
  svg.append("text")
    .attr("class", "lightOffLabel")
    .attr("x", constantXScale(new Date(2023,0,1,18,0)))
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", "#333")
    .style("font-size", "16px");
  
  svg.append("text")
    .attr("class", "x-axis-label")
    .attr("x", width/2)
    .attr("y", height + margin.bottom - 10)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("fill", "#333")
    .text("Time of Day");
  
  svg.append("text")
    .attr("class", "y-axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -height/2)
    .style("text-anchor", "middle")
    .text(currentMode === "temperature" ? "Temperature (°C)" : "Activity Level");
  
  xAxis = svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickValues(fullDayTicks)
      .tickFormat(customTimeFormat)
    );
  
  yAxis = svg.append("g")
    .call(d3.axisLeft(yScale));
  
  const lightLegend = svg.append("g")
    .attr("class", "light-legend")
    .attr("transform", `translate(${width - 120},10)`);
    
  lightLegend.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 20)
    .attr("height", 20)
    .attr("fill", "white")
    .attr("stroke", "black");
    
  lightLegend.append("text")
    .attr("x", 25)
    .attr("y", 15)
    .text("Light On");
    
  lightLegend.append("rect")
    .attr("x", 0)
    .attr("y", 25)
    .attr("width", 20)
    .attr("height", 20)
    .attr("fill", LIGHTS_OFF_COLOR)
    .attr("stroke", "black");
    
  lightLegend.append("text")
    .attr("x", 25)
    .attr("y", 40)
    .text("Light Off");
  
  brush = d3.brushX()
    .extent([[0,0],[width,height]])
    .on("end", brushed);
  svg.append("g")
    .attr("class", "brush")
    .call(brush);
  
  updateBackground();
}

// --- NEW FUNCTION: controls the visibility of the Zoom Out button ---
function updateResetButtonVisibility() {
  const currentDomain = xScale.domain();
  const isZoomed = currentDomain[0].getTime() !== originalXDomain[0].getTime() ||
                   currentDomain[1].getTime() !== originalXDomain[1].getTime();
  const resetButton = document.getElementById("resetBrush");
  if (isZoomed) {
    resetButton.style.display = "block";
  } else {
    resetButton.style.display = "none";
  }
}

function updateBackground() {
  const greyStart = new Date(2023,0,1,0,0);
  const greyEnd = new Date(2023,0,1,12,0);
  const currentDomain = xScale.domain();
  const overlapStart = currentDomain[0] > greyStart ? currentDomain[0] : greyStart;
  const overlapEnd = currentDomain[1] < greyEnd ? currentDomain[1] : greyEnd;
  if (overlapStart < overlapEnd) {
    const x = xScale(overlapStart);
    const w = xScale(overlapEnd) - xScale(overlapStart);
    svg.select("rect.background")
      .attr("x", x)
      .attr("width", w)
      .attr("visibility", "visible");
  } else {
    svg.select("rect.background").attr("visibility", "hidden");
  }
}

function updateXAxis() {
  const currentDomain = xScale.domain();
  if (currentDomain[0].getTime() === originalXDomain[0].getTime() &&
      currentDomain[1].getTime() === originalXDomain[1].getTime()) {
    xAxis.transition().duration(250)
      .call(d3.axisBottom(xScale)
        .tickValues(fullDayTicks)
        .tickFormat(customTimeFormat)
      );
  } else {
    let tickInterval, tickFormat;
    const oneHour = 60*60*1000, sixHours = 6*oneHour, tenMinutes = 10*60*1000;
    const domainDuration = currentDomain[1] - currentDomain[0];
    if (domainDuration > sixHours) {
      tickInterval = d3.timeHour.every(1);
      tickFormat = d3.timeFormat("%-I %p");
    } else if (domainDuration > oneHour) {
      tickInterval = d3.timeMinute.every(15);
      tickFormat = d3.timeFormat("%-I:%M %p");
    } else if (domainDuration > tenMinutes) {
      tickInterval = d3.timeMinute.every(5);
      tickFormat = d3.timeFormat("%-I:%M %p");
    } else {
      tickInterval = d3.timeMinute.every(1);
      tickFormat = d3.timeFormat("%-I:%M:%S %p");
    }
    xAxis.transition().duration(250)
      .call(d3.axisBottom(xScale)
        .ticks(tickInterval)
        .tickFormat(tickFormat)
      );
  }
}

function updateChart() {
  const chartData = getChartData();
  const smoothedData = smoothData(chartData, SMOOTH_WINDOW);

  // Updated color scale: male = "lightblue", estrus = "#d93d5f", non‑estrus = "lightpink" // orangey-yellow "#ffae42"
  const colorScale = d3.scaleOrdinal()
    .domain(["male", "estrus", "non-estrus"])
    .range(["lightblue", "#d93d5f", "lightpink"]);
  
  yScale.domain([globalYDomain[0]*0.98, globalYDomain[1]*1.02]);
  yAxis.transition().duration(250).call(d3.axisLeft(yScale));
  updateXAxis();
  updateBackground();
  
  const lineGenerator = d3.line()
      .x((d, i) => xScale(times[i]))
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX);
  
  // Create hit areas for easier selection
  const hitPaths = svg.selectAll(".mouse-hit")
      .data(smoothedData, d => d.id);
  
  hitPaths.enter()
      .append("path")
        .attr("class", "mouse-hit")
        .attr("fill", "none")
        .attr("stroke", "transparent")
        .attr("stroke-width", 10)
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .on("click", lineClicked)
    .merge(hitPaths)
      .transition().duration(d => d.id.includes("avg") ? 250 : 600)
          .attr("d", d => lineGenerator(d.data));
  
  hitPaths.exit().remove();
  
  // Create visible paths
  const lines = svg.selectAll(".mouse-line")
      .data(smoothedData, d => d.id);
  
  lines.enter()
      .append("path")
        .attr("class", "mouse-line")
        .attr("clip-path", "url(#clip)")
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.gender === "male" ? "male" : d.type))
        .attr("stroke-width", d => d.id.includes("avg") ? 3 : 1.5)
        .attr("opacity", d => d.id.includes("avg") ? 0.7 : 0)
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .on("click", lineClicked)
    .merge(lines)
      .transition().duration(d => d.id.includes("avg") ? 250 : 600)
          .attr("d", d => lineGenerator(d.data))
          .attr("stroke", d => {
              if (d.gender === "male") return "lightblue";
              return d.type === "estrus" ? "#d93d5f" : "lightpink";
          })
          .attr("stroke-width", d => d.id.includes("avg") ? 3 : 1.5)
          .attr("opacity", 0.7);
  
  lines.exit().remove();
  
  // Ensure average lines are raised on top
  svg.selectAll(".mouse-line")
      .filter(d => d.id.includes("avg"))
      .raise();
  svg.selectAll(".mouse-hit")
      .filter(d => d.id.includes("avg"))
      .raise();
}

// --- UPDATED TOOLTIP FUNCTIONS ---
function showTooltip(event, mouse) {
  const hoveredId = mouse.id;
  d3.selectAll(".mouse-line")
      .filter(d => d.id === hoveredId)
      .attr("opacity", 1)
      .attr("stroke-width", d => d.id.includes("avg") ? 3 : 2.5);
  d3.selectAll(".mouse-line")
      .filter(d => d.id !== hoveredId)
      .attr("opacity", 0.5);
      
  const message = hoveredId.includes("avg") ? "click to view all mice" : "click to view mouse";
  let tooltipHTML = `<strong>${mouse.id}</strong><br>Gender: ${mouse.gender}<br>`;
  if (mouse.gender !== "male" && mouse.type) {
      tooltipHTML += `Type: ${mouse.type.replace("-", " ")}<br>`;
  }
  tooltipHTML += `<em>${message}</em>`;
  
  // Position tooltip relative to the #advanced-chart container
  const containerRect = document.getElementById("advanced-chart").getBoundingClientRect();
  tooltip
    .style("left", `${event.clientX - containerRect.left + 110}px`)
    .style("top", `${event.clientY - containerRect.top + 15}px`)
    .html(tooltipHTML)
    .classed("visible", true);
}

function moveTooltip(event) {
  const containerRect = document.getElementById("advanced-chart").getBoundingClientRect();
  tooltip
    .style("left", `${event.clientX - containerRect.left + 110}px`)
    .style("top", `${event.clientY - containerRect.top + 15}px`);
}

function hideTooltip() {
  d3.selectAll(".mouse-line")
      .attr("opacity", 0.7)
      .attr("stroke-width", d => d.id.includes("avg") ? 3 : 1.5);
  tooltip.classed("visible", false);
}

function lineClicked(event, d) {
  if (!d.id.includes("avg")) {
    window.location.href = `mouseDetail.html?mouseID=${d.id}&mode=${currentMode}`;
  } else {
    let groupKey;
    if (d.gender === "male") groupKey = "male";
    else if (d.gender === "female") groupKey = d.type;
    expandedGroups[groupKey] = !expandedGroups[groupKey];
    updateChart();
  }
}

function brushed(event) {
  if (!event.selection) return;
  const [x0, x1] = event.selection;
  xScale.domain([xScale.invert(x0), xScale.invert(x1)]);
  updateXAxis();
  yAxis.transition().duration(500).call(d3.axisLeft(yScale));
  updateBackground();
  
  const lineGenerator = d3.line()
      .x((d, i) => xScale(times[i]))
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX);
  svg.selectAll(".mouse-line")
      .transition().duration(500)
      .attr("d", d => lineGenerator(d.data));
  
  svg.select(".brush").call(brush.move, null);
  updateResetButtonVisibility();
}

function resetBrush() {
  xScale.domain(originalXDomain);
  yScale.domain(originalYDomain);
  updateXAxis();
  yAxis.transition().duration(500).call(d3.axisLeft(yScale));
  updateBackground();
  
  const lineGenerator = d3.line()
      .x((d, i) => xScale(times[i]))
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX);
  svg.selectAll(".mouse-line")
      .transition().duration(500)
      .attr("d", d => lineGenerator(d.data));
  updateResetButtonVisibility();
}

function setupDataTypeButtons() {
  document.getElementById("temp-button").addEventListener("click", () => {
    if (currentMode !== "temperature") {
      currentMode = "temperature";
      d3.select("#advanced-chart").select("svg").remove();
      loadData();
    }
  });
  
  document.getElementById("activity-button").addEventListener("click", () => {
    if (currentMode !== "activity") {
      currentMode = "activity";
      d3.select("#advanced-chart").select("svg").remove();
      loadData();
    }
  });
}

function updateNarrativeText(currentMode) {
  const narrativeDiv = document.getElementById("narrative-advanced");
  narrativeDiv.innerHTML = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const modeParam = urlParams.get("mode");
  if (modeParam) { currentMode = modeParam; }
  const filterParam = urlParams.get("filter");
  if (filterParam === "male") {
    selectedFilters = { male: true, estrus: false, "non-estrus": false };
    document.getElementById("maleCheckbox").checked = true;
    document.getElementById("estrusCheckbox").checked = false;
    document.getElementById("nonEstrusCheckbox").checked = false;
  } else if (filterParam === "female") {
    selectedFilters = { male: false, estrus: true, "non-estrus": true };
    document.getElementById("maleCheckbox").checked = false;
    document.getElementById("estrusCheckbox").checked = true;
    document.getElementById("nonEstrusCheckbox").checked = true;
  }
  
  loadData();
  setupDataTypeButtons();
  
  d3.select("#maleCheckbox").on("change", function() {
    selectedFilters.male = this.checked;
    updateChart();
  });
  d3.select("#estrusCheckbox").on("change", function() {
    selectedFilters.estrus = this.checked;
    updateChart();
  });
  d3.select("#nonEstrusCheckbox").on("change", function() {
    selectedFilters["non-estrus"] = this.checked;
    updateChart();
  });
  d3.select("#resetBrush").on("click", resetBrush);
  

});

document.getElementById("back-button").addEventListener("click", () => {
  window.location.href = "home.html";
});

window.addEventListener("resize", () => {
  updateDimensions();
  svg.select(".brush").call(brush.move, null);
});
