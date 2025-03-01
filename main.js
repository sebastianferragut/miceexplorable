import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// Data vars
let femaleTempData = [];
let maleTempData = [];
let femaleActData = [];
let maleActData = [];

// Select summary-tooltip
const summaryTooltip = d3.select("#summary-tooltip");

const times = d3.range(1440).map(i => new Date(2023, 0, 1, 0, i));
const LIGHTS_OFF_COLOR = "rgba(0, 0, 0, 0.1)";

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

// Plot vars
let maleXScale;
let femaleXScale;

// Filtering vars for scroll 
let filteredMaleData;
let filteredFemaleData;

// Scroller vars
let ITEM_HEIGHT = 120; // Height of each item in the scroll plot
const scrollItems = d3.select("#scroll-text");

// Processing functions 

// Fetch data
async function loadTemperatureData(filename, label) {
    let data = [];
    const fileData = await d3.csv(`data/${filename}`);
    
    fileData.forEach((row, i) => {
        if (!data[i]) {
            data[i] = { minute: i + 1 };
        }

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

// Process mice data into average of the 14 days collapsed into 1 day
function processMiceData(dataset) {
    const miceIDs = Object.keys(dataset[0]).filter(k => k !== "minuteIndex");

    let avgData = miceIDs.map(mouseID => {
        const dailyData = new Array(1440).fill(0);
        let daysCount = 0;

        dataset.forEach((row, idx) => {
            const minute = idx % 1440;
            dailyData[minute] += row[mouseID];
            if (minute === 0) daysCount++;
        });

        return {
            id: mouseID,
            data: dailyData.map(v => v / daysCount)
        };
    });

    return avgData.slice(1);
}


// Main handler 
document.addEventListener("DOMContentLoaded", async () => {
    // Load data
    const femaleLabel = ["f"];
    const maleLabel = ["m"];

    maleTempData = await loadTemperatureData("male_temp.csv", maleLabel);
    femaleTempData = await loadTemperatureData("fem_temp.csv", femaleLabel);
    maleActData = await loadActivityData("male_act.csv", maleLabel);
    femaleActData = await loadActivityData("fem_act.csv", femaleLabel);

    // DEBUG statements 
    // console.log("maleTempData", maleTempData);
    // console.log("femaleTempData", femaleTempData);
    console.log("maleActData", maleActData);
    console.log("femaleActData", femaleActData);


    // Create general chart 
    summaryChart("temp"); 
     
    // Handle button behavior for summaryChart 
    let tempButton = d3.select("#temp-button");
    let actButton = d3.select("#activity-button");

    // Create event listeners for buttons
    tempButton.on("click", () => {
        summaryChart("temp");
    });
    actButton.on("click", () => {
        summaryChart("act");
    });


    // Create scroll and two graphs 
    updateScrollPlots();
    // Create scroll handling event 
    const scrollContainer = d3.select("#scroll-container");
    const spacer = d3.select("#spacer");
     
    let NUM_ITEMS = 14;
    let totalHeight = (NUM_ITEMS -1) * ITEM_HEIGHT;

    // Set the height of the spacer to create the illusion of scrollable content
    spacer.style("height", `${totalHeight}px`);


    // NEEDS WORK 

    // Create scroll text items
    let scrollDays = []; // should separate data into each day 

    // Initial render of scroll text 
    scrollItems.selectAll("div")
        .data(scrollDays) // data should be separated by day
        .enter()
        .append("div")
        .html((scrollDay, index) => `
            <p>
                On ${scrollDay} of the study, the female mice were active for __, with an average temperature of __.
                The male mice were active for __, with an average temperature of __. 
            </p>
        `)
        .style('position', 'absolute')
        .style('top', (_, i) => `${i * ITEM_HEIGHT}px`);
});


// Visualization functions 

// Creates general chart for all data
function summaryChart(chartType) {
    // Process data into 14 days  
    let maleAvgTempData = processMiceData(maleTempData);
    let maleAvgActData = processMiceData(maleActData);
    let femaleAvgTempData = processMiceData(femaleTempData);
    let femaleAvgActData = processMiceData(femaleActData);

    const margin = { top: 20, right: 30, bottom: 50, left: 50 };
    const containerWidth = 800;
    const containerHeight = 450;

    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    // Clear #summary-chart SVG element
    d3.select("#summary-chart").selectAll("*").remove();

    // Create SVG element
    const svg = d3.select("#summary-chart")
        .append("svg")
            .attr("width", containerWidth)
            .attr("height", containerHeight)
        .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add a clipPath so that lines are contained.
    svg.append("defs")
        .append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("width", width)
        .attr("height", height);

    // Create scales
    let xScale = d3.scaleTime()
        .domain([new Date(2023, 0, 1, 0, 0), new Date(2023, 0, 1, 23, 59)])
        .range([0, width]);

    let yScale;

    // Add x-axis title: "Time of Day"
    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 10)
        .attr("text-anchor", "middle")
        .text("Time of Day");

    // Draw x-axis. For the full-day view, force our custom tick values.
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale)
            .tickValues(fullDayTicks)
            .tickFormat(customTimeFormat)
        );

    // Conditional for loading data based on button input 
    let data, yLabel;
    if (chartType === "temp") {
        data = [...maleAvgTempData, ...femaleAvgTempData];
        yLabel = "Temperature (°C)";
        yScale = d3.scaleLinear()
            .domain([34, d3.max(data, d => d3.max(d.data))])
            .range([height, 0]);
    } else if (chartType === "act") {
        data = [...maleAvgActData, ...femaleAvgActData];
        yLabel = "Activity";
        yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d3.max(d.data))])
            .range([height, 0]);
    }

    // Draw y-axis
    svg.append("g")
        .call(d3.axisLeft(yScale));

    // Add y-axis title
    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 15)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .text(yLabel);

    const lineGenerator = d3.line()
        .x((d, i) => xScale(times[i]))
        .y(d => yScale(d))
        .curve(d3.curveMonotoneX);

    // Draw lines
    svg.selectAll(".mouse-line")
        .data(data)
        .enter()
        .append("path")
            .attr("class", "mouse-line")
            .attr("clip-path", "url(#clip)")
            .attr("fill", "none")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.7)
            .on("mouseover", showSummaryTooltip)
            .on("mousemove", moveSummaryTooltip)
            .on("mouseleave", hideSummaryTooltip)
        .attr("d", d => lineGenerator(d.data))
        .attr("stroke", d => d.id.startsWith("m") ? "blue" : "pink");
}

// Updates scroll graphs
function updateScrollPlots() {
    // NEEDS WORK, should call maleChart and femaleChart at some point 
}

// Manages male scroll plot
function maleChart() {
    // NEEDS WORK
}

// Manages female scroll plot
function femaleChart() {
    // NEEDS WORK
}

function showSummaryTooltip(event, mouse) {
    const hoveredId = mouse.id;
    d3.selectAll(".mouse-line")
      .filter(d => d.id === hoveredId)
      .attr("opacity", 1)
      .attr("stroke-width", 2.5);
    d3.selectAll(".mouse-line")
      .filter(d => d.id !== hoveredId)
      .attr("opacity", 0.1);

    const gender = hoveredId.startsWith("m") ? "Male" : "Female";

    d3.select("#summary-tooltip-id").text(hoveredId);
    d3.select("#summary-tooltip-gender").text(gender);

    summaryTooltip
      .style("display", "block")
      .style("opacity", .80)
      .style("left", `${event.pageX + 15}px`)
      .style("top", `${event.pageY - 15}px`);
}
  
function moveSummaryTooltip(event) {
    summaryTooltip.style("left", `${event.pageX + 15}px`)
            .style("top", `${event.pageY - 15}px`);
}

function hideSummaryTooltip() {
    d3.selectAll(".mouse-line")
        .attr("opacity", 0.7)
        .attr("stroke-width", 1.5);
    summaryTooltip.style("opacity", 0);
}


// TODO

// function showMaleTooltip(event, mouse) {
    
// }
  
// function moveMaleTooltip(event) {
    
// }

// function hideMaleTooltip() {
   
// }

// function showFemaleTooltip(event, mouse) {
    
// }
  
// function moveFemaleTooltip(event) {
    
// }

// function hideFemaleTooltip() {
   
// }



