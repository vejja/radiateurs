function Logger() {
	var level = 'debug'; // Choisir entre error, info et debug

	this.debug = function() {
		if (level == 'debug') {
			var logDate = new Date();
			console.log('LOG [' + logDate.toString() + ']', arguments);
		}
	};

	this.info = function() {
		if (level == 'info' || level == 'debug') {
			var logDate = new Date();
			console.log('INF [' + logDate.toString() + ']', arguments);
		}
	};

	this.error = function() {
		var logDate = new Date();
		console.log('ERR [' + logDate.toString() + ']', arguments);
	};
}

var logger = new Logger();

module.exports = logger;