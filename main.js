import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let fem_data;
let male_data;

// Fetch data
async function fetchData() {
    fem_act = d3.csv("data/fem_act.csv");
    fem_temp = d3.csv("data/fem_temp.csv");
    male_act = d3.csv("data/male_act.csv");
    male_temp = d3.csv("data/male_temp.csv");
}

function processData() {
    female_mice = 

    male_mice = 
    
}

document.addEventListener("DOMContentLoaded", async () => {
    await fetchData();
    processData();
    
    console.log(fetchData());
    // Create general chart 

    // Create scroll and two graphs 
     
    // Create scroll handling event 
});