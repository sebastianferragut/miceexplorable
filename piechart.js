// Data storage for temperatures
let femaleTempData = [];
let maleTempData = [];

// Load temperature data from CSV files
async function loadTemperatureData(filenames, labels) {
    let data = [];

    for (let fileIndex = 0; fileIndex < filenames.length; fileIndex++) {
        const filename = filenames[fileIndex];
        console.log(filename);
        const subjectPrefix = labels[fileIndex];

        const fileData = await d3.csv(`./data/${filename}`);

        fileData.forEach((row, i) => {
            if (!data[i]) {
                data[i] = { minute: i + 1 };
            }

            for (let j = 1; j <= 13; j++) {
                data[i][`${subjectPrefix}${j}`] = Number(row[`${subjectPrefix}${j}`]) || NaN;
            }
        });
    }
    return data;
}

// Categorize temperature data into 0.5°C bins
function categorizeTemperatureData(tempData) {
    let bins = {};
    for (let temp = 35; temp < 40; temp += 0.5) {
        bins[`${temp}-${temp + 0.5}`] = 0;
    }

    let totalValues = 0;

    tempData.flat().forEach(temp => {
        for (let bin in bins) {
            let [low, high] = bin.split("-").map(Number);
            if (temp >= low && temp < high) {
                bins[bin]++;
                totalValues++;
                break;
            }
        }
    });

    return bins; // Store actual counts for hover effect
}

// Draw the two pie charts (Left: Male, Right: Female)
function drawPieCharts(femaleBins, maleBins) {
    const svg = d3.select("#piechart").append("svg")
        .attr("width", 1200) // Increased width for two pie charts
        .attr("height", 600);

    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const radius = 200; // Size of each pie chart

    // Define color gradient from yellow → orange → red
    const uniqueBins = Object.keys(femaleBins);
    const colorScale = d3.scaleLinear()
        .domain([0, uniqueBins.length - 1])
        .range(["yellow", "red"]); // Gradient from yellow to red

    const pie = d3.pie().sort(null).value(d => d.value);

    const arc = d3.arc().innerRadius(0).outerRadius(radius);

    let femaleData = uniqueBins.map((bin, i) => ({
        key: bin, value: femaleBins[bin], color: colorScale(i)
    }));
    let maleData = uniqueBins.map((bin, i) => ({
        key: bin, value: maleBins[bin], color: colorScale(i)
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

    // Create groups for both pie charts
    const maleGroup = svg.append("g")
        .attr("transform", `translate(${width / 4}, ${height / 2})`);

    const femaleGroup = svg.append("g")
        .attr("transform", `translate(${(width * 3) / 4}, ${height / 2})`);

    // Function to show tooltip
    function showTooltip(event, d, gender) {
        tooltip.style("visibility", "visible")
            .html(`<strong>${gender} Mice</strong><br>
                   Temperature: ${d.data.key}°C<br>
                   Count: ${d.data.value}`)
            .style("top", `${event.pageY - 20}px`)
            .style("left", `${event.pageX + 10}px`);
    }

    // Function to hide tooltip
    function hideTooltip() {
        tooltip.style("visibility", "hidden");
    }

    // Draw Male Pie Chart (Left Side)
    maleGroup.selectAll(".maleSlice")
        .data(pie(maleData))
        .enter()
        .append("path")
        .attr("d", arc)
        .attr("fill", d => d.data.color)
        .attr("stroke", "")
        .attr("stroke-width", 1)
        .on("mouseover", (event, d) => showTooltip(event, d, "Male"))
        .on("mousemove", (event) => {
            tooltip.style("top", `${event.pageY - 20}px`)
                   .style("left", `${event.pageX + 10}px`);
        })
        .on("mouseout", hideTooltip);

    // Draw Female Pie Chart (Right Side)
    femaleGroup.selectAll(".femaleSlice")
        .data(pie(femaleData))
        .enter()
        .append("path")
        .attr("d", arc)
        .attr("fill", d => d.data.color)
        .attr("stroke", "")
        .attr("stroke-width", 1)
        .on("mouseover", (event, d) => showTooltip(event, d, "Female"))
        .on("mousemove", (event) => {
            tooltip.style("top", `${event.pageY - 20}px`)
                   .style("left", `${event.pageX + 10}px`);
        })
        .on("mouseout", hideTooltip);

    // Add Titles for Male & Female
    svg.append("text")
        .attr("x", width / 4)
        .attr("y", 50)
        .attr("text-anchor", "middle")
        .style("font-size", "20px")
        .style("font-weight", "bold")
        .text("Male Mice Temperature Distribution");

    svg.append("text")
        .attr("x", (width * 3) / 4)
        .attr("y", 50)
        .attr("text-anchor", "middle")
        .style("font-size", "20px")
        .style("font-weight", "bold")
        .text("Female Mice Temperature Distribution");

    // Legend
    const legend = svg.append("g")
        .attr("transform", `translate(${width / 2 - 80}, 100)`);

    legend.selectAll("rect")
        .data(uniqueBins)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", (d, i) => i * 20)
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", (d, i) => colorScale(i));

    legend.selectAll("text")
        .data(uniqueBins)
        .enter()
        .append("text")
        .attr("x", 30)
        .attr("y", (d, i) => i * 20 + 15)
        .text(d => d)
        .attr("font-size", "12px");
}

// Load data and generate the charts
document.addEventListener("DOMContentLoaded", async () => {
    const tempFiles = [
        "fem_temp.csv",
        "male_temp.csv"
    ];
    const labels = ["f", "m"];

    const temperatureData = await loadTemperatureData(tempFiles, labels);

    femaleTempData = [];
    maleTempData = [];

    for (let min = 0; min < temperatureData.length; min++) {
        let minuteTemps = temperatureData[min];

        if (minuteTemps) {
            femaleTempData.push(Object.values(minuteTemps).slice(1, 14));
            maleTempData.push(Object.values(minuteTemps).slice(14, 26));
        }
    }

    const femaleBins = categorizeTemperatureData(femaleTempData);
    const maleBins = categorizeTemperatureData(maleTempData);

    drawPieCharts(femaleBins, maleBins);
});
