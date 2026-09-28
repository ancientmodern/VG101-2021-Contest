require(["jquery", "/js/checkLogin", "/js/cfColor"], function ($, check, color) {
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c];
        });
    }

    var COLS = 6;
    var loggedIn = null; // unknown until /oauth/check answers
    var hasData = false;

    check().then(function (result) {
        loggedIn = !!result;
        if (result) {
            $("#signin").children().text(result).attr("href", "/profile");
        }
    });

    function getStatusStyle(match) {
        if (match.status === 0) return "pending";
        if (match.winner === -1) return "draw";
        if (match.winner === 0) return "u1win";
        return "u2win";
    }

    function getQueryVariable(variable) {
        var query = window.location.search.substring(1);
        var vars = query.split("&");
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split("=");
            if (pair[0] === variable) {
                return pair[1];
            }
        }
        return false;
    }

    // Display names from the scoreboard: they fill the name suggestions and
    // let us catch a misspelt name before asking the server, which can't
    // handle a filter for a player who doesn't exist.
    var playerNames = null;
    var namesRequest = $.ajax({url: "/scoreboard", dataType: "text", timeout: 20000})
        .done(function (text) {
            try {
                playerNames = JSON.parse(text).map(function (u) {
                    return String(u.dispName);
                });
            } catch (e) {
                return;
            }
            var list = $("#playerNames");
            playerNames.slice().sort().forEach(function (name) {
                list.append($("<option>").attr("value", name));
            });
        });

    function resultCell(match) {
        var style = getStatusStyle(match);
        var html;
        if (style === "pending") {
            html = "<span class=\"tw-badge tw-badge--wait\">Pending</span>";
        } else if (style === "draw") {
            html = "<span class=\"tw-badge tw-badge--draw\">Draw</span>";
        } else {
            var side = style === "u1win" ? "A" : "B";
            html = "<span class=\"tw-badge tw-badge--win\">Win</span> " +
                "<span class=\"tw-tag" + (side === "B" ? " tw-tag--b" : "") + "\" aria-hidden=\"true\" title=\"Player " + side +
                " won\">" + side + "</span><span class=\"tw-sr\"> Player " + side + " won</span>";
        }
        return "<td class=\"col-result\">" + html + "</td>";
    }

    function playerCell(match, k) {
        var p = k === 0 ? match.p1 : match.p2;
        var score = match.status ? match.scores[k === 0 ? "p1" : "p2"][1] : p.score;
        var lost = match.status && match.winner !== -1 && match.winner !== k;
        var name = String(p.dispName);
        return "<td class=\"col-" + (k === 0 ? "a" : "b") + "\"><span class=\"tw-side-name" + (lost ? " is-loser" : "") + "\">" +
            "<span class=\"tw-tag" + (k === 1 ? " tw-tag--b" : "") + "\" aria-hidden=\"true\">" + (k === 0 ? "A" : "B") + "</span>" +
            "<a class=\"tw-name " + color.scoreToTier(score) + "\" href=\"/match?player=" +
            escapeHtml(encodeURIComponent(name)) + "\" data-player=\"" + escapeHtml(name) + "\" title=\"Show " +
            escapeHtml(name) + "'s matches\">" + escapeHtml(name) + "</a></span></td>";
    }

    function ratingCell(match, k) {
        var cls = "col-" + (k === 0 ? "ra" : "rb") + " col-rating tw-num";
        if (!match.status) {
            return "<td class=\"" + cls + "\"><span class=\"tw-rating-move\">Not played yet</span></td>";
        }
        var s = match.scores[k === 0 ? "p1" : "p2"];
        var before = Math.round(Number(s[0])), after = Math.round(Number(s[1]));
        var d = after - before;
        var delta = d > 0 ? "<span class=\"tw-delta tw-delta--up\">+" + d + "</span>"
            : d < 0 ? "<span class=\"tw-delta tw-delta--down\">&minus;" + (-d) + "</span>"
                : "<span class=\"tw-delta\">&plusmn;0</span>";
        return "<td class=\"" + cls + "\"><span class=\"tw-rating-move\">" + escapeHtml(before) +
            " &rarr; <b>" + escapeHtml(after) + "</b></span>" + delta + "</td>";
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
        var dataGrid = $("#datagrid");
        var name = $.trim($("#search_name").val());
        var filtering = $("#filter").is(":checked");

        if (!result.data.length) {
            var page = parseInt(getQueryVariable("page"), 10);
            if (page > 1) {
                dataGrid.html(messageRow("Nothing on page " + page,
                    "There aren't that many matches.", "<a class=\"tw-btn tw-btn--quiet\" href=\"/match\">Go to the first page</a>"));
            } else if (filtering && name) {
                dataGrid.html(messageRow("No matches for " + escapeHtml(name) + " yet",
                    "Matches appear here once the judge has played them."));
            } else if (filtering) {
                dataGrid.html(messageRow("You haven't played a match yet",
                    "Submit a brain and the judge will schedule games against other players.",
                    "<a class=\"tw-btn\" href=\"/submission/submit\">Submit a brain</a>"));
            } else {
                dataGrid.html(messageRow("No matches yet",
                    "Matches appear here once the judge has played them."));
            }
        } else {
            dataGrid.html(result.data.map(function (match) {
                return "<tr class=\"match-" + getStatusStyle(match) + "\">" +
                    resultCell(match) +
                    playerCell(match, 0) + ratingCell(match, 0) +
                    playerCell(match, 1) + ratingCell(match, 1) +
                    "<td class=\"tw-go\"><a class=\"tw-link\" href=\"/match/" + escapeHtml(match._id) + "\">" +
                    (match.status ? "Replay" : "Details") + " &rarr;</a></td>" +
                    "</tr>";
            }).join(""));
        }

        $(".pager").html(result.pager);
        hasData = true;
    }

    var pending = null;

    function refreshList() {
        var listQuery = "/match/list?1=1"
        let page = getQueryVariable("page");
        if (page) {
            listQuery += "&page=" + encodeURIComponent(decodeURIComponent(page));
        }
        var name = $.trim($("#search_name").val());
        if ($("#filter").is(":checked")) {
            if (name) {
                if (playerNames && playerNames.indexOf(name) < 0) {
                    $("#datagrid").html(messageRow("No player called \u201c" + escapeHtml(name) + "\u201d",
                        "Names must match the scoreboard exactly, including the <span class=\"tw-code\">bot:</span> " +
                        "prefix for bots. Pick one from the suggestions as you type."));
                    $(".pager").html("");
                    return;
                }
                listQuery += "&filter=" + encodeURIComponent(name);
            } else {
                if (loggedIn === false) {
                    $("#datagrid").html(messageRow("Sign in to see your own matches",
                        "With the name left empty, the filter shows your matches. Or type a player's name.",
                        "<a class=\"tw-btn\" href=\"/oauth\">Sign in</a>"));
                    $(".pager").html("");
                    return;
                }
                listQuery += "&filter=1";
            }
        }

        if (pending) pending.abort();
        pending = $.ajax({url: listQuery, dataType: "text", cache: false, timeout: 20000})
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
            .fail(function (xhr, status) {
                if (status !== "abort") failed();
            })
            .always(function () {
                pending = null;
            });
    }

    function failed() {
        if (hasData) {
            stamp("Couldn't refresh at", "showing the earlier list, retrying in a minute");
            return;
        }
        $("#refreshState").text("Couldn't load matches.");
        $("#refreshTime").text("");
        $("#datagrid").html(messageRow("The match list didn't load",
            "The judge server didn't answer. Check your connection, then try again.",
            "<button type=\"button\" class=\"tw-btn tw-btn--quiet\" data-action=\"retry\">Try again</button>"));
    }

    function showLoading() {
        $("#datagrid").html("<tr class=\"tw-table__msg\"><td colspan=\"" + COLS +
            "\"><div class=\"tw-loading\">Loading matches</div></td></tr>");
    }

    var refreshInterval;

    function restart() {
        clearInterval(refreshInterval);
        refreshInterval = setInterval(refreshList, 60000);
        // Wait for the name list so a misspelt name is caught first.
        namesRequest.always(refreshList);
    }

    // /match?player=NAME (linked from the scoreboard and player names).
    function applyPlayerFromUrl() {
        var player = getQueryVariable("player");
        if (player === false) return;
        try {
            player = decodeURIComponent(player.replace(/\+/g, " "));
        } catch (e) {
        }
        $("#search_name").val(player);
        $("#filter").prop("checked", true);
    }

    applyPlayerFromUrl();

    restart();

    $("#filter").on("click", function () {
        showLoading();
        restart();
    });

    // Enter in the name box applies the filter.
    $("#filterForm").on("submit", function (e) {
        e.preventDefault();
        $("#filter").prop("checked", true);
        showLoading();
        restart();
    });

    // Changing the name while the filter is on re-runs it.
    $("#search_name").on("change", function () {
        if ($("#filter").is(":checked")) {
            showLoading();
            restart();
        }
    });

    // Clicking a player's name filters by them without a page reload.
    $("#datagrid").on("click", "a[data-player]", function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        $("#search_name").val($(this).attr("data-player"));
        $("#filter").prop("checked", true);
        if (window.history && history.pushState) history.pushState(null, "", $(this).attr("href"));
        showLoading();
        restart();
    });

    // Paging keeps the current filter: load the page in place.
    $(".pager").on("click", "a.pager__item", function (e) {
        if (!(window.history && history.pushState)) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        history.pushState(null, "", $(this).attr("href"));
        showLoading();
        restart();
        var top = $(".tw-card").offset().top - 16;
        if ($(window).scrollTop() > top) $(window).scrollTop(top);
    });

    $(window).on("popstate", function () {
        applyPlayerFromUrl();
        showLoading();
        restart();
    });

    $("#datagrid").on("click", "[data-action=retry]", function () {
        showLoading();
        restart();
    });
});
