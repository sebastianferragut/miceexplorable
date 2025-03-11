import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// Data vars
let femaleTempData = [];
let maleTempData = [];
let femaleActData = [];
let maleActData = [];

let tempData = [];
let actData = [];

let mouseIDSelector = 1;

// Plot vars
let tempXScale;
let actXScale;

// Filtering vars for scroll 
let selectedMouseData;
let sliceEndIndex; 

// Scroller vars
let ITEM_HEIGHT = 180; // Height of each item in the scroll plot
const scrollItems = d3.select("#scroll-text");
const scrollContainer = d3.select("#scroller");
const spacer = d3.select("#spacer");


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

// Process mice data into grouped by mice ID, by day 
function processMiceData(dataset) {
    const miceIDs = Object.keys(dataset[0]).filter(k => k !== "minute");

    let groupedData = miceIDs.map(mouseID => {
        let daysData = [];
        let currentDay = [];

        dataset.forEach((row, idx) => {
            const minute = idx % 1440;
            currentDay.push(row[mouseID]);

            if (minute === 1439) {
                daysData.push(currentDay);
                currentDay = [];
            }
        });

        return {
            id: mouseID,
            data: daysData
        };
    });

    return groupedData;
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

    maleTempData = processMiceData(maleTempData);
    femaleTempData = processMiceData(femaleTempData);
    maleActData = processMiceData(maleActData);
    femaleActData = processMiceData(femaleActData);

    let combinedData = [];
    for (let day = 0; day < 14; day++) {
        combinedData.push({
            day: day + 1,
            maleTempData: maleTempData.map(mouse => ({ id: mouse.id, data: mouse.data[day] })),
            femaleTempData: femaleTempData.map(mouse => ({ id: mouse.id, data: mouse.data[day] })),
            maleActData: maleActData.map(mouse => ({ id: mouse.id, data: mouse.data[day] })),
            femaleActData: femaleActData.map(mouse => ({ id: mouse.id, data: mouse.data[day] }))
        });
    }

    
    // Mouse ID selection filtering for scroll plots
    const mouseIDDropdown = d3.select("#mouse-dropdown");
    
    
    mouseIDDropdown.on("change", function() { 
        mouseIDSelector = +this.value;

        let maleSelector = "m" + mouseIDSelector;
        let femaleSelector = "f" + mouseIDSelector;

        // Filter data for selected mouse ID
        selectedMouseData = combinedData.map(day => ({
            day: day.day,
            maleTempData: day.maleTempData.find(mouse => mouse.id === maleSelector),
            femaleTempData: day.femaleTempData.find(mouse => mouse.id === femaleSelector),
            maleActData: day.maleActData.find(mouse => mouse.id === maleSelector),
            femaleActData: day.femaleActData.find(mouse => mouse.id === femaleSelector)
        }));

        // Initial scroll plots with first day of data selected
        updateScrollPlots(selectedMouseData, 1);

        // Handle scrolling and scroll text
        let NUM_ITEMS = 14;
        let totalHeight = (NUM_ITEMS -1) * ITEM_HEIGHT;

        // Set the height of the spacer to create the illusion of scrollable content
        spacer.style("height", `${totalHeight}px`);

        // Remove existing scroll items
        scrollItems.selectAll("div").remove();
        // Initial render of scroll text 
        scrollItems.selectAll("div")
            .data(selectedMouseData) 
            .enter()
            .append("div")
            .html((scrollDay) => {
                // Process day 
                let avgFemaleActivity = d3.mean(scrollDay.femaleActData.data);
                let avgFemaleTemp = d3.mean(scrollDay.femaleTempData.data);
                let avgMaleActivity = d3.mean(scrollDay.maleActData.data);
                let avgMaleTemp = d3.mean(scrollDay.maleTempData.data);

                return `
                    <p>
                    On day ${scrollDay.day} of the study:
                    </p>
                    <p> 
                    Female mouse ${femaleSelector} had average activity of ${avgFemaleActivity.toFixed(2)} units, 
                    with an average temperature of ${avgFemaleTemp.toFixed(2)}.
                    </p>
                    <p>
                    Male mouse ${maleSelector} had average activity of ${avgMaleActivity.toFixed(2)} units, 
                    with an average temperature of ${avgMaleTemp.toFixed(2)}. 
                    </p>
                `;
            })
            .style('position', 'absolute')
            .style('top', (_, i) => `${i * ITEM_HEIGHT}px`);
    });
    // Trigger the change event programmatically to initialize data with default val of 1
    mouseIDDropdown.property("value", mouseIDSelector).dispatch("change");

    scrollContainer.on("scroll", () => {
        // Get current scroll position
        const scrollTop = scrollContainer.property("scrollTop");

        let scrolledCommits = Math.floor(scrollTop / (ITEM_HEIGHT-10));
        scrolledCommits = 2 + scrolledCommits;

        let sliceEndIndex = scrolledCommits;
        
        if (scrollTop > 1190) {
            sliceEndIndex = sliceEndIndex + 1;
        } 

        // Update the visualizations with sliceEndIndex
        updateScrollPlots(selectedMouseData, sliceEndIndex); 
        
        // Show date next to scrollbar and cap slideEndIndex to avoid errors
        if (sliceEndIndex > 14) {
            sliceEndIndex = 14;
        }
        if (sliceEndIndex <= 13) {
            let dateText = `Day ${selectedMouseData[sliceEndIndex - 1].day}`;
            d3.select("#scroll-indicator").text(dateText);
        } else {
            let dateText = `Day ${selectedMouseData[13].day}`;
            d3.select("#scroll-indicator").text(dateText);
        }
    });
});


// Visualization functions 

// Updates scroll graphs
function updateScrollPlots(selectedMouseData, sliceEndIndex) {
    tempData = selectedMouseData.map(day => ({
        day: day.day,
        maleTempData: day.maleTempData.data,
        femaleTempData: day.femaleTempData.data
    }));

    actData = selectedMouseData.map(day => ({
        day: day.day,
        maleActData: day.maleActData.data,
        femaleActData: day.femaleActData.data
    }));

    // Slice tempData and actData according to sliceEndIndex
    tempData = tempData.slice(0, sliceEndIndex);
    actData = actData.slice(0, sliceEndIndex);

    scrollChart(tempData, "temp");
    scrollChart(actData, "act");
}

// Manages scroll plots
function scrollChart(data, chartType) {
    const margin = { top: 20, right: 30, bottom: 50, left: 50 };
    const containerWidth = 800;
    const containerHeight = 350;

    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const numDays = data.length;

    // Clear the SVG element
    d3.select(`#${chartType}-chart`).selectAll("*").remove();

    // Create SVG element
    const svg = d3.select(`#${chartType}-chart`)
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
    const xScale = d3.scaleLinear()
        .domain([0, numDays * 1440])
        .range([0, width]);

    // Function to format x-axis labels with both time and day markers
    const timeFormat = d => {
        const totalMinutes = d % 1440;  // Get minutes within the day
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const dayNum = Math.floor(d / 1440) + 1; // Determine day number

        // Format time string
        const timeStr = `${hours}:${minutes === 0 ? '00' : minutes}`;

        // Show day markers at the end of each day
        if (totalMinutes === 1439) {
            return `Day ${dayNum}`;
        }
        
        return timeStr;
    };

    let yScale, yLabel;

    if (chartType === "temp") {
        yLabel = "Temperature (°C)";
        yScale = d3.scaleLinear()
            .domain([34, d3.max(data, d => d3.max(d.maleTempData.concat(d.femaleTempData)))])
            .range([height, 0]);
    } else if (chartType === "act") {
        yLabel = "Activity";
        yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d3.max(d.maleActData.concat(d.femaleActData)))])
            .range([height, 0]);
    }

    // Add x-axis title
    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 10)
        .attr("text-anchor", "middle")
        .text("Day");

    // Draw x-axis with only "Day X" markers at every 1440 minutes
    svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
        .tickValues(d3.range(1440, numDays * 1440 + 1, 1440)) // Ticks only at full days
        .tickFormat(d => `Day ${d / 1440}`) // Labels: "Day 1", "Day 2", etc.
    );

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
        .x((d, i) => xScale(i + d.day * 1440))  // Correct x-positioning
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);
    
    // Determine the data fields based on chartType
    let maleDataField, femaleDataField;
    if (chartType === "temp") {
        maleDataField = "maleTempData";
        femaleDataField = "femaleTempData";
    } else if (chartType === "act") {
        maleDataField = "maleActData";
        femaleDataField = "femaleActData";
    }

    // Draw lines for males
    svg.selectAll(".mouse-line")
        .data(data.map((d, dayIndex) => d[maleDataField].map((value, i) => ({ value, day: dayIndex, index: i })))) // Attach day index
        .enter()
        .append("path")
            .attr("class", "mouse-line")
            .attr("clip-path", "url(#clip)")
            .attr("fill", "none")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.7)
            .attr("d", d => lineGenerator(d))
            .attr("stroke", "lightblue");
    
    // Draw lines for females
    svg.selectAll(".mouse-line-female")
        .data(data.map((d, dayIndex) => d[femaleDataField].map((value, i) => ({ value, day: dayIndex, index: i })))) // Attach day index
        .enter()
        .append("path")
            .attr("class", "mouse-line-female")
            .attr("clip-path", "url(#clip)")
            .attr("fill", "none")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.7)
            .attr("d", d => lineGenerator(d))
            .attr("stroke", "#lightpink");
}

// TODO: Add tooltip functions and incorporate them into scrollChart

// function showTempTooltip(event, mouse) {
    
// }
  
// function moveTempTooltip(event) {
    
// }

// function hideTempTooltip() {
   
// }

// function showActTooltip(event, mouse) {
    
// }
  
// function moveActTooltip(event) {
    
// }

// function hideActTooltip() {
   
// }



