define("cfColor", [], function() {
    return {
        scoreToColor(score) {
            if (score === "unrated" || score < 1000) return "gray";
            if (score < 1500) return "black";
            if (score < 2000) return "green";
            if (score < 2400) return "#75dfbb";
            if (score < 2800) return "#aaabfe";
            if (score < 3000) return "purple";
            if (score < 3200) return "orange";
            return "red";
        },
        // Same bands as scoreToColor, as a CSS class (.tw-tier-N in site.css)
        // whose colours are darkened to be readable on white.
        scoreToTier(score) {
            if (score === "unrated" || score === undefined || score < 1000) return "tw-tier-0";
            if (score < 1500) return "tw-tier-1";
            if (score < 2000) return "tw-tier-2";
            if (score < 2400) return "tw-tier-3";
            if (score < 2800) return "tw-tier-4";
            if (score < 3000) return "tw-tier-5";
            if (score < 3200) return "tw-tier-6";
            return "tw-tier-7";
        }
    }
})
