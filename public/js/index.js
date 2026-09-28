require(["jquery", "/js/checkLogin", "/js/cfColor"], function ($, check, color) {
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c];
        });
    }

    check().then(function (result) {
        if (result) {
            $("#signin").children().text(result).attr("href", "/profile");
        }
    });

    var COLS = 7;
    var hasData = false;

    function count(n) {
        n = Number(n);
        return isFinite(n) ? n : 0;
    }

    function ordinal(n) {
        var s = (n % 100 >= 11 && n % 100 <= 13) ? "TH" : ({1: "ST", 2: "ND", 3: "RD"}[n % 10] || "TH");
        return n + s;
    }

    function playerLink(item) {
        return "<a class=\"tw-name " + color.scoreToTier(item.score) + "\" href=\"/match?player=" +
            escapeHtml(encodeURIComponent(item.dispName)) + "\" title=\"" + escapeHtml(item.dispName) + "\">" +
            escapeHtml(item.dispName) + "</a>";
    }

    function recordBar(item) {
        var w = count(item.win), l = count(item.lose), d = count(item.draw), total = w + l + d;
        if (!total) return "<span class=\"tw-bar\" aria-hidden=\"true\"></span>";
        return "<span class=\"tw-bar\" aria-hidden=\"true\">" +
            "<i class=\"w\" style=\"width:" + (100 * w / total) + "%\"></i>" +
            "<i class=\"l\" style=\"width:" + (100 * l / total) + "%\"></i>" +
            "<i class=\"d\" style=\"width:" + (100 * d / total) + "%\"></i></span>";
    }

    function podiumSpot(entry, place) {
        var item = entry.item;
        return "<li class=\"tw-podium__spot tw-podium__spot--" + place + "\">" +
            "<p class=\"tw-podium__ord\">" + ordinal(entry.rank) + "</p>" +
            "<p class=\"tw-podium__name\">" + playerLink(item) + "</p>" +
            "<p class=\"tw-podium__rating\"><span class=\"tw-pixel\">" + escapeHtml(item.score) +
            "</span><span class=\"tw-podium__unit\">rating</span></p>" +
            "<div class=\"tw-podium__stats\">" + recordBar(item) +
            "<p class=\"tw-record\"><span><b>" + count(item.win) + "</b> won</span>" +
            "<span><b>" + count(item.lose) + "</b> lost</span>" +
            "<span><b>" + count(item.draw) + "</b> drawn</span></p></div>" +
            "</li>";
    }

    function boardRow(entry) {
        var item = entry.item;
        var rating = item.score === "unrated"
            ? "<span class=\"tw-unrated\">unrated</span>"
            : "<span class=\"tw-pixel " + color.scoreToTier(item.score) + "\">" + escapeHtml(item.score) + "</span>";
        return "<tr>" +
            "<td class=\"col-rank\"><span class=\"tw-pixel\">" + entry.rank + "</span></td>" +
            "<td class=\"col-user\">" + playerLink(item) + "</td>" +
            "<td class=\"col-rating tw-num\">" + rating + "</td>" +
            "<td class=\"col-wld tw-num\">" + count(item.win) + "</td>" +
            "<td class=\"col-wld tw-num\">" + count(item.lose) + "</td>" +
            "<td class=\"col-wld tw-num\">" + count(item.draw) + "</td>" +
            "<td class=\"col-bar\">" + recordBar(item) + "</td>" +
            "</tr>";
    }

    function messageRow(title, text, action) {
        return "<tr class=\"tw-table__msg\"><td colspan=\"" + COLS + "\"><div class=\"tw-empty\">" +
            "<p class=\"tw-empty__title\">" + title + "</p>" +
            "<p class=\"tw-empty__text\">" + text + "</p>" + (action || "") +
            "</div></td></tr>";
    }

    function stamp(prefix, suffix) {
        var now = new Date();
        $("#refreshState").text(prefix);
        $("#refreshTime").html("<time datetime=\"" + now.toISOString() + "\">" +
            escapeHtml(now.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"})) +
            "</time> &middot; " + suffix);
    }

    function render(result) {
        // Same ranking as before: rated players in server order (by rating),
        // equal ratings share a rank; all unrated players share the next rank.
        var rank = 0;
        var lastRating = undefined;
        var rated = [];
        var unrated = [];

        result.forEach(function (item) {
            if (item.score !== "unrated") {
                if (item.score !== lastRating) {
                    rank++;
                    lastRating = item.score;
                }
                rated.push({item: item, rank: rank});
            } else {
                unrated.push(item);
            }
        });

        rank++;
        unrated = unrated.map(function (item) {
            return {item: item, rank: rank};
        });

        var podium = rated.slice(0, 3).filter(function (e) {
            return e.rank <= 3;
        });
        $("#podium")
            .attr("class", "tw-podium tw-podium--" + podium.length)
            .html(podium.map(function (e, i) {
                return podiumSpot(e, i + 1);
            }).join(""));

        var rest = rated.slice(podium.length).concat(unrated);
        var html;
        if (!result.length) {
            html = messageRow("No players yet",
                "Players appear here after they sign in for the first time.");
        } else if (!rest.length) {
            html = messageRow("That's everyone", "Only the players on the podium have signed up so far.");
        } else {
            html = rest.map(boardRow).join("");
            if (!rated.length) {
                html = "<tr class=\"tw-table__msg\"><td colspan=\"" + COLS + "\"><p class=\"tw-alert tw-board__note\">" +
                    "<strong>No ratings yet.</strong> A player gets a rating once they have finished a match; " +
                    "until then everyone shares the same rank.</p></td></tr>" + html;
            }
        }
        $("#datagrid").html(html);
        hasData = true;
    }

    function refreshScoreboard() {
        $.ajax({url: "/scoreboard", dataType: "text", cache: false, timeout: 20000})
            .done(function (text) {
                var result;
                try {
                    result = JSON.parse(text);
                } catch (e) {
                    return failed();
                }
                render(result);
                stamp("Updated", "refreshes every minute");
            })
            .fail(failed);
    }

    function failed() {
        if (hasData) {
            stamp("Couldn't refresh at", "showing the earlier list, retrying in a minute");
            return;
        }
        $("#refreshState").text("Couldn't load the scoreboard.");
        $("#refreshTime").text("");
        $("#datagrid").html(messageRow("The scoreboard didn't load",
            "The judge server didn't answer. Check your connection, then try again.",
            "<button type=\"button\" class=\"tw-btn tw-btn--quiet\" data-action=\"retry\">Try again</button>"));
    }

    $("#datagrid").on("click", "[data-action=retry]", function () {
        $("#datagrid").html("<tr class=\"tw-table__msg\"><td colspan=\"" + COLS +
            "\"><div class=\"tw-loading\">Loading the scoreboard</div></td></tr>");
        refreshScoreboard();
    });

    refreshScoreboard();
    setInterval(refreshScoreboard, 60000);
})
