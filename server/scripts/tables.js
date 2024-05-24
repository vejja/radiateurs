import { Database } from 'sqlite3'
const database = new Database('/home/pi/radiateurs/server/radiateurs.db')
database.all(
  'SELECT * FROM statistics;',
  (error, rows) => {
    for (const row of rows) {
      const year = row.year
      const month = row.month
      const date = row.date
      const hour = row.hour
      const off1 = row.off1
      const off2 = row.off2
      const off3 = row.off3
      const int1 = row.int1
      const int2 = row.int2
      const int3 = row.int3
      const watts = row.watts
      const meter = row.meter
      const jsDate = new Date(year, month, date, hour, 0, 0, 0)
      const unixDate = jsDate.getTime() / 1000
      database.run(
        'INSERT INTO statistics2 (start, off1, off2, off3, int1, int2, int3, watts, meter) VALUES ($start, $off1, $off2, $off3, $int1, $int2, $int3, $watts, $meter);', 
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
        (error_) => {
          if (error_) {
            console.error('reset statistics : INSERT query failed;', error_)
          } /* else {

          } */
        })
    }
  }
)
