let Match = require("../execute");

let match = new Match();

match.setExecutable("./LAB6_2", "./LAB6_2")

console.log(JSON.stringify(match.record));

match.execute().then(r => {
    console.log(r);
    console.log(JSON.stringify(match.record));
});
