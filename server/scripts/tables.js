var sqlite3 = require('sqlite3');
var db = new sqlite3.Database('/home/pi/radiateurs/server/radiateurs.db');
db.all(
    "SELECT * FROM statistics;",
    (err, rows) => {
        rows.forEach(function(row) {
            var year = row.year;
            var month = row.month;
            var date = row.date;
            var hour = row.hour;
            var off1 = row.off1;
            var off2 = row.off2;
            var off3 = row.off3;
            var int1 = row.int1;
            var int2 = row.int2;
            var int3 = row.int3;
            var watts = row.watts;
            var meter = row.meter;
            var jsDate = new Date(year, month, date, hours, 0, 0, 0);
            var unixDate = jsDate.getTime() / 1000;
            db.run(
                "INSERT INTO statistics2 (start, off1, off2, off3, int1, int2, int3, watts, meter) VALUES ($start, $off1, $off2, $off3, $int1, $int2, $int3, $watts, $meter);", 
                {
                    $start : unixDate,
                    $off1 : off1,
                    $off2: off2,
                    $off3: off3,
                    $int1: int1,
                    $int2: int2,
                    $int3: int3,
                    $watts: watts,
                    $meter: meter
                }, 
                (err) => {
                    if (err) {
                        log.error('reset statistics : INSERT query failed; ', err);
                    } else {

                    }
                });
        });
    }
);
