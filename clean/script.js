//this is a simple postgres SQL client
var pgp = require('pg-promise')();

//this allows the use of JavaScript Promises - provides a better way to do callbacks; there is no synchronous SQL client for nodejs so this is required
var Promise = require("bluebird");

//this line reader was used insted of native lineread because lineread cannot be paused and resumed. It would output all of the lines at once, filling up memory
var FileLineReader = require("filelinereader");

var fs = require('fs');


const filename = 'penalty_data_set_0.csv';

//filename of an SQL file that contains clears and creates the database schema
const initfilename = "init.sql";

//COPY PASTED FROM http://stackoverflow.com/questions/8493195/how-can-i-parse-a-csv-string-with-javascript-which-contains-comma-in-data
// cols.split(','); would break when it encounters escaped fields.
// Return array of string values, or NULL if CSV string not well formed.
function csvToArray(text) {
    let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
    for (l in text) {
        l = text[l];
        if ('"' === l) {
            if (s && l === p) row[i] += l;
            s = !s;
        } else if (',' === l && s) l = row[++i] = '';
        else if ('\n' === l && s) {
            if ('\r' === p) row[i] = row[i].slice(0, -1);
            row = ret[++r] = [l = '']; i = 0;
        } else row[i] += l;
        p = l;
    }
    return ret;
};

var lineCount = 0;
var errorLines = {};

var cameras = {};
var laws = {};

function addError(line, description){
	if(typeof errorLines[line] == 'undefined'){
		errorLines[line] = {errors: []};
	}
	errorLines[line].errors.push(description);
}

var db = pgp({host: "172.17.0.5", user: "postgres", password: "animal", database: "speed"});

reader = new FileLineReader(filename);

//this promise is used to do a synchronous while loop
//allows me to read one line at a time without processing multiple lines at the same time
function doloop(){
	return new Promise((res,rej)=>{
		if(!reader.hasNextLine()) return res();
		processNextOffence()
		.then(()=>{
			return doloop();
		})
		.then(()=>{
			res();
		})
		.catch((e)=>{
			throw e;
			rej(e);
		})
	});
}

var initstring = fs.readFileSync(initfilename).toString();

var startTime = Date.now();

//ENTRYPOINT HERE
//run the init SQL
console.log("ENTRYPOINT HERE");
db.query(initstring)
.then(()=>{
	//loop through all lines
	return doloop();
})
.then(()=>{
	//we have reached eof at this point
	//print out validation errors and statistics
	console.log('all lines processed');
	console.log("ERRORS: ");
	var count = 0
	for(var line in errorLines){
		console.log("LINE " + line + ":  ");
		count++;
		for(var i = 0; i < errorLines[line].errors.length; i++){
			console.log(errorLines[line].errors[i]);
		}
		console.log("\n");
	}
	//print count of errors and percentage of errors to total lines
	console.log(count, "errors", "("+100*(count/lineCount)+"%)");
	console.log('Ran for', (Date.now() - startTime)/1000, 'seconds');
})
.catch((e)=>{
	console.log(e);
});


function insertLaw(legislation, section){
	return new Promise((res,rej)=>{
		//check local variable if the law already exists in the DB
		if(typeof laws[legislation+'___'+section] != 'undefined') return res();
		db.query('INSERT INTO law (legislation, section) VALUES ($1, $2)', [legislation, section])
		.then(()=>{
			laws[legislation+'___'+section] = true;
			res();
		});
	})
}

function insertCamera(location, description, type){
	return new Promise((res,rej)=>{
		//check local variable if the camera already exists in the DB
		if(typeof cameras[location] != 'undefined') return res();
		db.query('INSERT INTO camera (location_code, location_description, type) VALUES ($1, $2, $3)', [location, description, (type.length==0)?null:type])
		.then(()=>{
			cameras[location] = true;
			res();
		});
	})
}

//used in insertOffence to provide a more consistent format for speed bands
var excess_speed = {
	'EXCEED SPEED 10KM/H OR UNDER': '10-',
	'EXCEED SPEED OVER 30KM/H': '30+',
	'EXCEED SPEED OVER 20KM/H': '20+',
	'EXCEED SPEED OVER 10KM/H': '10+',
	'EXCEED SPEED 45KM/H OR OVER': '45+'
}

function insertOffence(cols){
	return new Promise((res,rej)=>{
		//ensure that the law and camera of this line exists in the db first
		insertCamera(cols[9], cols[10], cols[8])
		.then(()=>{
			return insertLaw(cols[4], cols[5]);
		})
		.then(()=>{
			db.query('INSERT INTO offence (code, law_legislation, law_section, camera, description,\
			 month, red_light, special_vehicle, cases, total_fine_value, excess_speed)\
			 VALUES ($1, $2, $3, $4, $5, to_date($6, \'DD/MM/YYYY\'), $7, $8, $9, $10, $11)', 
			 [cols[2], cols[4], cols[5], cols[9], cols[3], cols[1], cols[15]=="Y", (cols[22].length == 0)?null:cols[22], cols[23], cols[24], (typeof excess_speed[cols[12]] == 'undefined')?null:excess_speed[cols[12]]])
			.then(()=>{
				res();
			})
			.catch((e)=>{
				//this file contains duplicate rows - discard these duplictes
				//'23505' is a duplocate primary key error from Postgres
				if(e.code == '23505'){
					addError(lineCount, "there was a duplicate entry in the csv. more info: " + e.detail);
					return res();
				}
				rej(e);
			});
		})
		
	})
}

function processNextOffence(){
	return new Promise((res,rej)=>{
		//split the current line of CSV into an array of fields
		var cols = csvToArray(reader.nextLine().replace(/(\r\n|\n|\r)/gm,""))[0];

		lineCount++;

		//log progress once every 10000 lines
		if(lineCount%10000==0) console.log('validating line', lineCount);

		//start validating the line

		if(lineCount == 1){
			//header row
			return res();
		}
		
		if(cols == null){
			//malformed csv
			addError(lineCount, "malformed csv line");
			return res();
		}
		if(cols.length != 25){
			addError(lineCount, "invalid number of columns " + cols.length);
			return res();
		}

		//7: CAMERA_IND
		if(cols[7] != 'Y'){
			//not a camera fine
			//silently ignore the line
			return res();
		}

		//25: RED_LIGHT_CAMERA_IND, 26: SPEED_CAMERA_IND
		if(!(cols[25] != 'Y' || cols[26] != 'Y')){
			//not a speeding or red light fine
			//silently ignore the line
			return res();
		}

		//8: CAMERA_TYPE
		if(cols[8] == ''){
			addError(lineCount, "camera type not defined");
			return res();
		}

		//23: TOTAL_NUMBER
		if(isNaN(cols[23])){
			addError(lineCount, "TOTAL_NUMBER is not a number");
			return res();
		}

		//24: TOTAL_VALUE
		if(isNaN(cols[24])){
			addError(lineCount, "TOTAL_VALUE is not a number");
			return res();
		}

		//all validation tests have passed
		//pass cols to insert function

		insertOffence(cols)
		.then(()=>{
			res();
		})
		.catch((e)=>{
			throw e;
			rej(e);
		})
	});
}
