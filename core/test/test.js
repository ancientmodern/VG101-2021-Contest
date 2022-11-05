let Match = require("../execute");

let match = new Match();

match.setExecutable("./LAB6_2", "./LAB6_2")

match.execute((result) => {
    console.log(result);
    console.log(JSON.stringify(match.record));
});
