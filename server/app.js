var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser');
var app = express();
var teleinfo = require('./monitor');


// Protocole CORS
app.use(cors());
// Parse JSON
app.use(bodyParser.json());

// Route list
// liste des radiateurs enregistrés dans la base
app.get('/list', function (req, res) {
	console.log('list route');
	teleinfo.getHeaters()
	.then((heaters) => {
		res.send(heaters);
	});
});

// Route status
// Ampérage et délestage par phase
app.get('/phasestatus', function (req, res) {
	console.log('status route');
	teleinfo.getPhaseStatus()
	.then((phases)  => {
		res.send(phases);		
	});
});

// Route commmand
// Modifie l'ordre GIFAM sur un radiateur
app.post('/command', function (req, res) {
	console.log('command route');
	teleinfo.setCommandForHeater(req.body.command, req.body.id)
	.then((heaters) => {
		res.send(heaters);
	});
});

// Route commmands
// Applique le même ordre sur tous les radiateurs
app.post('/commands', function (req, res) {
	console.log('commands route');
	teleinfo.setCommandForAllHeaters(req.body.command)
	.then((heaters) => {
		res.send(heaters);
	});
});

app.listen(3000, function () {
	console.log('Example app listening on port 3000!');
});