require(["jquery", "/js/checkLogin", "/js/cfColor"], function ($, check, color) {
    check().then(function (result) {
        if (result) {
            $("#signin").children().html(result).attr("href", "/profile");
        }
    });

    function refreshScoreboard() {
        $.get("/scoreboard", function (result) {
            result = JSON.parse(result);

            var container = $("#datagrid");
            container.html("");
            var rank = 0;
            var lastRating = undefined;
            var unrated = [];

            result.forEach(function (item, count) {
                // if ((item.score !== "unrated" && item.score !== lastRating) || (item.score === "unrated" && lastRating !== 0)) {
                //     rank++;
                //     if (item.score === "unrated") lastRating = 0;
                //     else lastRating = item.score;
                // }
                if (item.score !== "unrated") {
                    if (item.score !== lastRating) {
                        rank++;
                        lastRating = item.score;
                    }
                    container.append($("<tr>\n" +
                        "                                    <td class=\"col--rank\">#" + rank.toString() + "</td>\n" +
                        "                                    <td class=\"col--user\" style=\"color:" + color.scoreToColor(item.score) + ";font-weight:bold;\">" + item.dispName + "</td>\n" +
                        "                                    <td class=\"col--score\" style=\"color:" + color.scoreToColor(item.score) + ";font-weight:bold;\">" + item.score.toString() + "</td>\n" +
                        "                                    <td class=\"col--wins\">" + item.win.toString() + "</td>\n" +
                        "                                    <td class=\"col--loses\">" + item.lose.toString() + "</td>\n" +
                        "                                    <td class=\"col--draws\">" + item.draw.toString() + "</td>\n" +
                        "                                </tr>")
                    );
                } else {
                    unrated.append(item);
                }
            });

            rank++;
            unrated.forEach(function (item, count) {
                container.append($("<tr>\n" +
                    "                                    <td class=\"col--rank\">#" + rank.toString() + "</td>\n" +
                    "                                    <td class=\"col--user\" style=\"color:" + color.scoreToColor(item.score) + ";font-weight:bold;\">" + item.dispName + "</td>\n" +
                    "                                    <td class=\"col--score\" style=\"color:" + color.scoreToColor(item.score) + ";font-weight:bold;\">" + item.score.toString() + "</td>\n" +
                    "                                    <td class=\"col--wins\">" + item.win.toString() + "</td>\n" +
                    "                                    <td class=\"col--loses\">" + item.lose.toString() + "</td>\n" +
                    "                                    <td class=\"col--draws\">" + item.draw.toString() + "</td>\n" +
                    "                                </tr>")
                );
            });

            $("#refreshTime").html(new Date(Date.now()));
        });
    }

    refreshScoreboard();
    setInterval(refreshScoreboard, 60000);
})
