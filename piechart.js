// Data storage for temperatures
let femaleTempData = [];
let maleTempData = [];
let femaleActData = [];
let maleActData = [];

// Load CSV data
async function loadData(filenames, labels) {
    let data = [];

    for (let fileIndex = 0; fileIndex < filenames.length; fileIndex++) {
        const filename = filenames[fileIndex];
        const subjectPrefix = labels[fileIndex];

        const fileData = await d3.csv(`./data/${filename}`);

        fileData.forEach((row, i) => {
            if (!data[i]) {
                data[i] = { minute: i + 1 };
            }
            // Expecting 13 columns per file for each subject
            for (let j = 1; j <= 13; j++) {
                data[i][`${subjectPrefix}${j}`] = Number(row[`${subjectPrefix}${j}`]) || NaN;
            }
        });
    }
    return data;
}

function categorizeData(data, minData, maxData, binsize) {
    let bins = {};
    for (let value = minData; value < maxData; value += binsize) {
        bins[`${value}-${value + binsize}`] = 0;
    }

    data.flat().forEach(temp => {
        for (let bin in bins) {
            let [low, high] = bin.split("-").map(Number);
            if (temp >= low && temp < high) {
                bins[bin]++;
                break;
            }
        }
    });
    return bins; 
}

function drawPieCharts(femaleBins, maleBins, dataType, divId) {
    const svg = d3.select(divId).append("svg")
        .attr("width", 1200) // Increased width for two pie charts
        .attr("height", 600);

    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const radius = 200; // Size of each pie chart

    // Use distinct color scales:
    const uniqueBins = Object.keys(femaleBins);
    const maleColorScale = d3.scaleLinear()
        .domain([0, uniqueBins.length - 1])
        .range(["lightblue", "darkblue"]);
    const femaleColorScale = d3.scaleLinear()
        .domain([0, uniqueBins.length - 1])
        .range(["pink", "red"]);

    const pie = d3.pie().sort(null).value(d => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(0).outerRadius(radius + 10);

    // Prepare data arrays for male and female
    let femaleData = uniqueBins.map((bin, i) => ({
        key: bin, value: femaleBins[bin], color: femaleColorScale(i)
    }));
    let maleData = uniqueBins.map((bin, i) => ({
        key: bin, value: maleBins[bin], color: maleColorScale(i)
    }));

    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background", "#fff")
        .style("padding", "8px")
        .style("border", "1px solid black")
        .style("border-radius", "5px")
        .style("visibility", "hidden")
        .style("font-size", "14px");

    // Function to show tooltip
    function showTooltip(event, d, gender) {
        tooltip.style("visibility", "visible")
            .html(`<strong>${gender} Mice</strong><br>
                   ${dataType}: ${d.data.key} ${dataType === "Temperature" ? "°C" : ""}<br>
                   Count: ${d.data.value}`)
            .style("top", `${event.pageY - 20}px`)
            .style("left", `${event.pageX + 10}px`);
    }

    // Function to hide tooltip
    function hideTooltip() {
        tooltip.style("visibility", "hidden");
    }

    // Draw Male Pie Chart (Left Side)
    const maleGroup = svg.append("g")
        .attr("transform", `translate(${width / 4}, ${height / 2})`);

    maleGroup.selectAll(".maleSlice")
        .data(pie(maleData))
        .enter()
        .append("path")
        .attr("class", "maleSlice")
        .attr("d", arc)
        .attr("fill", d => d.data.color)
        .on("mouseover", function(event, d) {
            d3.select(this).transition().duration(200)
              .attr("d", arcHover(d));
            showTooltip(event, d, "Male");
        })
        .on("mouseout", function(event, d) {
            d3.select(this).transition().duration(200)
              .attr("d", arc(d));
            hideTooltip();
        })
        .on("click", function(event, d) {
            // Redirect to advanced chart with temperature or activity mode and male filter.
            window.location.href = `advanced.html?mode=${dataType.toLowerCase()}&filter=male`;
        });

    // Draw Female Pie Chart (Right Side)
    const femaleGroup = svg.append("g")
        .attr("transform", `translate(${(width * 3) / 4}, ${height / 2})`);

    femaleGroup.selectAll(".femaleSlice")
        .data(pie(femaleData))
        .enter()
        .append("path")
        .attr("class", "femaleSlice")
        .attr("d", arc)
        .attr("fill", d => d.data.color)
        .on("mouseover", function(event, d) {
            d3.select(this).transition().duration(200)
              .attr("d", arcHover(d));
            showTooltip(event, d, "Female");
        })
        .on("mouseout", function(event, d) {
            d3.select(this).transition().duration(200)
              .attr("d", arc(d));
            hideTooltip();
        })
        .on("click", function(event, d) {
            // Redirect to advanced chart with temperature or activity mode and female filter.
            window.location.href = `advanced.html?mode=${dataType.toLowerCase()}&filter=female`;
        });

    // Add Titles for Male & Female
    svg.append("text")
        .attr("x", width / 4)
        .attr("y", 50)
        .attr("text-anchor", "middle")
        .style("font-size", "20px")
        .style("font-weight", "bold")
        .text(`Male Mice ${dataType} Distribution`);

    svg.append("text")
        .attr("x", (width * 3) / 4)
        .attr("y", 50)
        .attr("text-anchor", "middle")
        .style("font-size", "20px")
        .style("font-weight", "bold")
        .text(`Female Mice ${dataType} Distribution`);

    // Legend (for both groups; you can adjust as needed)
    const femalelegendGroup = svg.append("g")
        .attr("transform", `translate(${width - 80}, 100)`);

    femalelegendGroup.selectAll("rect")
        .data(uniqueBins)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", (d, i) => i * 20)
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", (d, i) => femaleColorScale(i));

    femalelegendGroup.selectAll("text")
        .data(uniqueBins)
        .enter()
        .append("text")
        .attr("x", 30)
        .attr("y", (d, i) => i * 20 + 15)
        .text(d => d)
        .attr("font-size", "12px");

    const malelegendGroup = svg.append("g")
        .attr("transform", `translate(${width/2 - 80}, 100)`);

    malelegendGroup.selectAll("rect")
        .data(uniqueBins)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", (d, i) => i * 20)
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", (d, i) => maleColorScale(i));

    malelegendGroup.selectAll("text")
        .data(uniqueBins)
        .enter()
        .append("text")
        .attr("x", 30)
        .attr("y", (d, i) => i * 20 + 15)
        .text(d => d)
        .attr("font-size", "12px");
}

// Helper: Find min and max across 2D array
function findMinMax(arr) {
    let min = Infinity;
    let max = -Infinity;

    for (const row of arr) {
        for (const num of row) {
            if (num < min) min = num;
            if (num > max) max = num;
        }
    }
    min = Math.floor(min);
    max = Math.ceil(max);
    return { min, max };
}

// Load data and generate the charts
document.addEventListener("DOMContentLoaded", async () => {
    const tempFiles = [
        "fem_temp.csv",
        "male_temp.csv"
    ];

    const activityFiles = [
        "fem_act.csv",
        "male_act.csv"
    ];
    const labels = ["f", "m"];

    const temperatureData = await loadData(tempFiles, labels);
    const activityData = await loadData(activityFiles, labels);
    
    for (let min = 0; min < temperatureData.length; min++) {
        let minuteTemps = temperatureData[min];
        if (minuteTemps) {
            femaleTempData.push(Object.values(minuteTemps).slice(1, 14));
            maleTempData.push(Object.values(minuteTemps).slice(14, 26));
        }
    }

    for (let min = 0; min < activityData.length; min++) {
        let minuteAct = activityData[min];
        if (minuteAct) {
            femaleActData.push(Object.values(minuteAct).slice(1, 14));
            maleActData.push(Object.values(minuteAct).slice(14, 26));
        }
    }
    const femaleTempStats = findMinMax(femaleTempData);
    const maleTempStats = findMinMax(maleTempData);
    const femaleActStats = findMinMax(femaleActData);
    const maleActStats = findMinMax(maleActData);

    const femaleTempBins = categorizeData(femaleTempData, femaleTempStats.min, femaleTempStats.max, 0.5);
    const maleTempBins = categorizeData(maleTempData, maleTempStats.min, maleTempStats.max, 0.5);
    const femaleActBins = categorizeData(femaleActData, femaleActStats.min, femaleActStats.max, 25);
    const maleActBins = categorizeData(maleActData, maleActStats.min, maleActStats.max, 25);
    
    drawPieCharts(femaleTempBins, maleTempBins, 'Temperature', "#temp-pie-chart");
    drawPieCharts(femaleActBins, maleActBins, "Activity", "#activity-pie-chart");
});
