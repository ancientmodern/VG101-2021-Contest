define("cfColor", [], function() {
    return {
        scoreToColor(score) {
            if (score === "unrated" || score < 1000) return "gray";
            if (score < 5000) return "black";
            if (score < 10000) return "green";
            if (score < 15000) return "#75dfbb";
            if (score < 20000) return "#aaabfe";
            if (score < 25000) return "purple";
            if (score < 300000) return "orange";
            return "red";
        }
    }
})
