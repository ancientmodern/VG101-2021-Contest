define("cfColor", [], function() {
    return {
        scoreToColor(score) {
            if (score === "unrated" || score < 1000) return "gray";
            if (score < 1500) return "black";
            if (score < 2000) return "green";
            if (score < 2300) return "#75dfbb";
            if (score < 2600) return "#aaabfe";
            if (score < 2850) return "purple";
            if (score < 3000) return "orange";
            return "red";
        }
    }
})
