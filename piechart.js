// Data storage for temperatures (for dynamic scrolly charts)
let femaleTempData = [];
let maleTempData = [];
let femaleActData = [];
let maleActData = [];
// Grouping arrays for days (14 days)
let tempArr = Array.from({ length: 14 }, () => []);
let actArr = Array.from({ length: 14 }, () => []);

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
                data[i][`${subjectPrefix}${j}`] = Number(row[`${subjectPrefix}${j}`]);
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

function drawPieCharts(femaleBins, maleBins, dataType, divId, width, height, radius) {
    d3.select(divId).select("svg").remove();
    const svg = d3.select(divId).append("svg")
        .attr("width", width) 
        .attr("height", height);
    const uniqueBins = Object.keys(femaleBins);
    const colorScale = dataType === "Activity" 
        ? d3.scaleLinear().domain([0, uniqueBins.length]).range(["lightgreen", "green"])
        : d3.scaleLinear().domain([0, uniqueBins.length]).range(["yellow", "red"]);
    const pie = d3.pie().sort(null).value(d => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(0).outerRadius(radius + 10);
    let femaleData = uniqueBins.map((bin, i) => ({
        key: bin, value: femaleBins[bin], color: colorScale(i)
    }));
    let maleData = uniqueBins.map((bin, i) => ({
        key: bin, value: maleBins[bin], color: colorScale(i)
    }));
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background", "#fff")
        .style("padding", "8px")
        .style("border", "1px solid black")
        .style("border-radius", "5px")
        .style("visibility", "hidden")
        .style("font-size", "14px");
    function showTooltip(event, d, gender) {
        tooltip.style("visibility", "visible")
            .html(`<strong>${gender} Mice</strong><br>
                   ${dataType}: ${d.data.key} ${dataType === "Temperature" ? "°C" : ""}<br>
                   Count: ${d.data.value}`)
            .style("top", `${event.pageY - 20}px`)
            .style("left", `${event.pageX + 10}px`);
    }
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
            window.location.href = `advanced.html?mode=${dataType.toLowerCase()}&filter=female`;
        });
    svg.append("text")
        .attr("x", width / 4)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .style("font-weight", "bold")
        .text(`Male Mice ${dataType} Distribution`);
    svg.append("text")
        .attr("x", (width * 3) / 4)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .style("font-weight", "bold")
        .text(`Female Mice ${dataType} Distribution`);
    const legendGroup = svg.append("g")
        .attr("transform", `translate(${width/2-20}, 50)`);
    legendGroup.selectAll("rect")
        .data(uniqueBins)
        .enter()
        .append("rect")
        .attr("x", -15)
        .attr("y", (d, i) => i * 20 )
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", (d, i) => colorScale(i));
    legendGroup.selectAll("text")
        .data(uniqueBins)
        .enter()
        .append("text")
        .attr("x", 15)
        .attr("y", (d, i) => i * 20 +15 )
        .text(d => d)
        .attr("font-size", "12px")
        .attr("padding-block", "0px");
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
    return { min: Math.floor(min), max: Math.ceil(max) };
}

// Update dynamic pie charts based on a selected time slice (day)
function updatePieChart(temperatureData, activityData){
    femaleTempData = [];
    maleTempData = [];
    femaleActData = [];
    maleActData = [];
    
    for (let i = 0; i < temperatureData.length; i++) {
        let minuteTemps = temperatureData[i];
        if (minuteTemps) {
            femaleTempData.push(Object.values(minuteTemps).slice(1, 14));
            maleTempData.push(Object.values(minuteTemps).slice(14, 26));
        }
    }
    for (let i = 0; i < activityData.length; i++) {
        let minuteAct = activityData[i];
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
    
    drawPieCharts(femaleTempBins, maleTempBins, 'Temperature', "#temp-pie-chart", 1000, 410, 160);
    drawPieCharts(femaleActBins, maleActBins, "Activity", "#activity-pie-chart", 1000, 410, 160);
}

// Update scroll content for day groups
function updateScrollContent(temperatureData, activityData) {
    const itemsContainer = d3.select('#items-container');
    itemsContainer.html("");
    for (let i = 0; i < temperatureData.length; i++) {
        let day = Math.floor(i / 1440);
        if(day < tempArr.length) {
            tempArr[day].push(temperatureData[i]);
            actArr[day].push(activityData[i]);
        }
    }
    let dayContainer = itemsContainer
        .selectAll('.day-group')
        .data(tempArr)
        .enter()
        .append('div')
        .attr('class', 'day-group')
        .style("margin-block", "15px")
        .style("border-bottom", "3px dashed #Ddd");
    dayContainer.append('dt')
        .html((_, i) => `<strong>Day ${i + 1}</strong>`)
        .style("font-size", "16px");
    dayContainer.append('dd')
        .html((_, i) => {
            let tempAverages = calculateGenderAverages(tempArr[i]);
            let actAverages = calculateGenderAverages(actArr[i]);
            return `
            <div class="temp" style="color: orange;">
                Temp Avg (F): ${tempAverages.femaleAvg}°C<br>
                Temp Avg (M): ${tempAverages.maleAvg}°C
            </div>
            <div class="activity" style="color: green;">
                Activity Avg (F): ${actAverages.femaleAvg}<br>
                Activity Avg (M): ${actAverages.maleAvg}
            </div>`;
        });
}

function calculateGenderAverages(dataArray) {
    let maleValues = [];
    let femaleValues = [];
    dataArray.forEach(entry => {
        Object.keys(entry).forEach(key => {
            if (key.startsWith("f") && typeof entry[key] === "number") {  
                femaleValues.push(entry[key]);  
            }
            if (key.startsWith("m") && typeof entry[key] === "number" && key !== "minute") {  
                maleValues.push(entry[key]);    
            }
        });
    });
    let maleAvg = maleValues.length > 0 
        ? (maleValues.reduce((a, b) => a + b, 0) / maleValues.length).toFixed(1) 
        : 'N/A';
    let femaleAvg = femaleValues.length > 0 
        ? (femaleValues.reduce((a, b) => a + b, 0) / femaleValues.length).toFixed(1) 
        : 'N/A';
    return { maleAvg, femaleAvg };
}

// NEW: Update overall average pie charts (static, across the whole experiment)
function updateOverallPieChart(temperatureData, activityData) {
    let femaleTempDataOverall = [];
    let maleTempDataOverall = [];
    let femaleActDataOverall = [];
    let maleActDataOverall = [];
    
    for (let i = 0; i < temperatureData.length; i++) {
        let minuteTemps = temperatureData[i];
        if (minuteTemps) {
            femaleTempDataOverall.push(Object.values(minuteTemps).slice(1, 14));
            maleTempDataOverall.push(Object.values(minuteTemps).slice(14, 26));
        }
    }
    for (let i = 0; i < activityData.length; i++) {
        let minuteAct = activityData[i];
        if (minuteAct) {
            femaleActDataOverall.push(Object.values(minuteAct).slice(1, 14));
            maleActDataOverall.push(Object.values(minuteAct).slice(14, 26));
        }
    }
    
    const femaleTempStatsOverall = findMinMax(femaleTempDataOverall);
    const maleTempStatsOverall = findMinMax(maleTempDataOverall);
    const femaleActStatsOverall = findMinMax(femaleActDataOverall);
    const maleActStatsOverall = findMinMax(maleActDataOverall);
    
    const femaleTempBinsOverall = categorizeData(femaleTempDataOverall, femaleTempStatsOverall.min, femaleTempStatsOverall.max, 0.5);
    const maleTempBinsOverall = categorizeData(maleTempDataOverall, maleTempStatsOverall.min, maleTempStatsOverall.max, 0.5);
    const femaleActBinsOverall = categorizeData(femaleActDataOverall, femaleActStatsOverall.min, femaleActStatsOverall.max, 25);
    const maleActBinsOverall = categorizeData(maleActDataOverall, maleActStatsOverall.min, maleActStatsOverall.max, 25);
    
    drawPieCharts(femaleTempBinsOverall, maleTempBinsOverall, 'Temperature', "#overall-temp-pie-chart", 1000, 400, 170);
    drawPieCharts(femaleActBinsOverall, maleActBinsOverall, "Activity", "#overall-activity-pie-chart",1000, 400, 170);
}

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
    
    // Initial dynamic pie charts (scrolly update)
    updatePieChart(temperatureData, activityData);
    updateScrollContent(temperatureData, activityData);
    // NEW: Render overall static pie charts based on averages across the whole experiment
    updateOverallPieChart(temperatureData, activityData);
    
    const scrollContainer = d3.select('#scroll-container');
    scrollContainer.on('scroll', () => {
        const scrollTop = scrollContainer.property('scrollTop');
        // Dividing by 150 to calculate day index (adjust if needed)
        const day = Math.floor(scrollTop / 150);
        if(day >= 0 && day < tempArr.length) {
            updatePieChart(tempArr[day], actArr[day]);
        }
    });
});
