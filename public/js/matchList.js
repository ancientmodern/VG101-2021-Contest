require(["jquery", "/js/checkLogin", "/js/cfColor"], function ($, check, color) {
    check().then(function (result) {
        if (result) {
            $("#signin").children().html(result).attr("href", "/profile");
        }
    });

    function getStatusStyle(match) {
        if (match.status === 0) return "pending";
        if (match.winner === -1) return "draw";
        if (match.winner === 0) return "u1win";
        return "u2win";
    }

    function getStatusText(match) {
        if (match.status === 0) return "Pending";
        if (match.winner === -1) return "Draw";
        if (match.winner === 0) return "P1 Win";
        return "P2 Win";
    }

    function getQueryVariable(variable)
    {
           var query = window.location.search.substring(1);
           var vars = query.split("&");
           for (var i=0;i<vars.length;i++) {
                   var pair = vars[i].split("=");
                   if(pair[0] === variable){return pair[1];}
           }
           return false;
    }

    function refreshList() {
        var listQuery = "/match/list?1=1"
        let page = getQueryVariable("page");
        if (page) {
            listQuery += "&page=" + page.toString();
        }
        if ($("#filter").is(":checked")) {
            listQuery += "&filter=1";
        }

        $.get(listQuery, function (result) {
            result = JSON.parse(result);

            var dataGrid = $("#datagrid");
            dataGrid.html("");

            result.data.forEach(function (match) {
                var tr = $("<tr>\n" +
                "<td class='col--status match-status--border pending'>\n" +
                "    <span class=\"icon match-status--icon " +  getStatusStyle(match) +"\"></span>\n" +
                "    <a href=\"/match/" + match._id + "\" class=\"match-status--text " +  getStatusStyle(match) +"\">\n" +
                    "       " +  getStatusText(match) +"\n" +
                    "    </a>\n" +
                    "  </td>\n" +
                    "  <td class=\"col--challenger\">\n" +
                    "      \n" +
                    "      <span class=\"player\" style=\"color:" + (match.status ? color.scoreToColor(match.scores.p1[1]) : color.scoreToColor(match.p1.score)) + ";font-weight:bold;\">\n" +
                    "        <span>" + match.p1.dispName + "</span>\n" +
                    "      </span>\n" +
                    "  </td>\n" +
                    "  <td class=\"col--rating\">\n" +
                    "    \n" +
                    "      <span class=\"rating\" style=\"color:" + (match.status ? color.scoreToColor(match.scores.p1[1]) : "gray") + ";font-weight:bold;\">\n" +
                    "        " +  (match.status ? (match.scores.p1[0] + "&#8594;" + match.scores.p1[1]) : "Pending") + "\n" +
                    "      </span>\n" +
                    "  </td>\n" +
                    "  <td class=\"col--challengee\">\n" +
                    "      \n" +
                    "      <span class=\"player\" style=\"color:" + (match.status ? color.scoreToColor(match.scores.p2[1]) : color.scoreToColor(match.p2.score)) + ";font-weight:bold;\">\n" +
                    "        " + match.p2.dispName + "\n" +
                    "      </span>\n" +
                    "    \n" +
                    "  </td>\n" +
                    "  <td class=\"col--rating\">\n" +
                    "    \n" +
                    "      <span class=\"rating\" style=\"color:" + (match.status ? color.scoreToColor(match.scores.p2[1]) : "gray") + ";font-weight:bold;\">\n" +
                    "        " +  (match.status ? (match.scores.p2[0] + "&#8594;" + match.scores.p2[1]) : "Pending") + "\n" +
                    "      </span>\n" +
                    "  </td>\n" +
                    "</tr>");

                    dataGrid.append(tr);
            });

            $(".pager").html(result.pager);

            $("#refreshTime").html(new Date(Date.now()));
        });
    }

    refreshList();
    var refreshInterval = setInterval(refreshList, 60000);

    $("#filter").on("click", function() {
        clearInterval(refreshInterval);
        refreshInterval = setInterval(refreshList, 60000);
        refreshList();
    })
});
