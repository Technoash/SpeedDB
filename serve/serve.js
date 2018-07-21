//this is a simple postgres SQL client
var pgp = require('pg-promise')();
//this allows the use of JavaScript Promises - provides a better way to do callbacks; there is no synchronous SQL client for nodejs so this is required
var Promise = require("bluebird");
//web/http server helper
var express = require('express');

var fecha = require('fecha');

var app = express();

//to decode POST data
var bodyParser = require('body-parser')
app.use( bodyParser.json() );
app.use(bodyParser.urlencoded({ 
	extended: true
}));

//serve all files in the public directory
app.use(express.static('public'));

var db = pgp({host: "172.17.0.5", user: "postgres", password: "animal", database: "speed"});



//generateConditions converts query in this format

	/*var query = {
		month_from: "2012-05-01T00:00:00.000Z",
		month_to: "2016-07-01T00:00:00.000Z",
		laws: [{legislation: "ROAD RULES 2008", section: "59(1)"}, {legislation: "ROAD RULES 2008", section: "20"}],
		cameras: ["7163", "9820"],
		excess_speeds: ["10-", "20+"],
		red_light: false,
		individual_fine_value_from: 10,
		individual_fine_value_to: 100
	};*/

//into an array of string conditions like 
	//"month >= ${month_from_0}"
//and parameters like
	//{month_from_0: "2007-1-1"}
function generateConditions(query, id){
	if(typeof id == 'undefined') id = "";
	var conditions = [];

	var params = {};

	if(query.month_from){
		params["month_from_" +  id] = fecha.format(new Date(query.month_from.year,query.month_from.month,1), 'YYYY-MM-DDTHH:mm:ss')
		conditions.push("month >= ${month_from_" +  id + "}");
	}
	if(query.month_to){
		params["month_to_" + id] = fecha.format(new Date(query.month_to.year,query.month_to.month,1), 'YYYY-MM-DDTHH:mm:ss')
		conditions.push("month <= ${month_to_" +  id + "}");
	}
	if(query.individual_fine_value_from !== null){
		params["individual_fine_value_from_" +  id] = query.individual_fine_value_from;
		conditions.push("(total_fine_value/cases) >= ${individual_fine_value_from_" +  id + "}");
	}
	if(query.individual_fine_value_to !== null){
		params["individual_fine_value_to_" +  id] = query.individual_fine_value_to;
		conditions.push("(total_fine_value/cases) <= ${individual_fine_value_to_" +  id + "}");
	}
	if(query.laws && query.laws.length){
		var tmp = "(";
		for(var i = 0; i < query.laws.length; i++){
			
			params['law_legislation_' + i + "_" +  id] = query.laws[i].legislation;
			tmp += "(law_legislation = ${" + 'law_legislation_' + i + "_" +  id + "} AND";
			params['law_section_' + i + "_" +  id] = query.laws[i].section;
			tmp += " law_section = ${" + 'law_section_' + i + "_" +  id + "})";
			if(i+1 < query.laws.length) tmp += " OR ";
			
		}
		tmp += ")";;
		conditions.push(tmp);
	}
	if(query.cameras && query.cameras.length){
		var tmp = "(";
		for(var i = 0; i < query.cameras.length; i++){
			params['camera_' + i + "_" +  id] = query.cameras[i];
			tmp += "camera = ${" + 'camera_' + i + "_" +  id + "}";
			if(i+1 < query.cameras.length) tmp += " OR ";
		}
		tmp += ")";;
		conditions.push(tmp);
	}
	if(query.excess_speeds && query.excess_speeds.length){
		var tmp = "(";
		for(var i = 0; i < query.excess_speeds.length; i++){
			params['excess_speed_' + i + "_" +  id] = query.excess_speeds[i];
			tmp += "excess_speed = ${" + 'excess_speed_' + i + "_" +  id + "}";
			if(i+1 < query.excess_speeds.length) tmp += " OR ";
		}
		tmp += ")";;
		conditions.push(tmp);
	}
	if(query.red_light !== null){
		conditions.push("red_light = " + ((query.red_light)?"true":"false"));
	}

	return {conditions, params};
}


app.post('/api/search', function (req, res) {
	//endpoint for the search page
	var builtConditions = generateConditions(req.body);

	//only specific columns are retreived for the search results
	db.query('SELECT code, month, law_legislation, law_section, description, red_light, excess_speed, special_vehicle, cases, total_fine_value, location_description, type as camera_type'
	+ ' FROM offence JOIN camera ON offence.camera=camera.location_code' + (builtConditions.conditions.length?' WHERE ':'') + builtConditions.conditions.join(" AND ") + ' LIMIT 100;', builtConditions.params)
	.then((data)=>{
		res.send(data);
	}).catch(function(e){
		console.log("SQL ERROR", e);
	});
	
});




//endpoint for the graph page
app.post('/api/graph', function (req, res) {
	var start = new Date();
	var queries = req.body.queries;
	var rangeName = req.body.rangeName;
	var domainName = req.body.domainName;
	var domain = req.body.domain;

	/*var queries = 
{
	'1': {
		month_from: {
			year: 2010, month: 1
		},
		month_to: null,
		laws: [],
		cameras: null,
		excess_speeds: [],
		red_light: null,
		individual_fine_value_from: 100,
		individual_fine_value_to: 300 
	},
	'2':  {
		month_from: null,
		month_to: null,
		laws: [],
		cameras: [],
		excess_speeds: [],
		red_light: true,
		individual_fine_value_from: 100,
		individual_fine_value_to: 900
	} 
};*/

	console.log('\n\n\n\n');
	console.log('request queries', queries);
	console.log('request rangeName', rangeName);
	console.log('request domainName', domainName);
	console.log('request domain', domain);
	console.log('\n\n\n\n');


	var fn = "COUNT";
	var value = rangeName;

	//stay safe
	if(!(domainName == 'none' || domainName == 'camera' || domainName == 'law' || domainName == 'month')){
		return;
	}

	
	if(rangeName == 'total_fine_value'){
		fn = "SUM";
	} else if(rangeName == 'total_fine_value/cases'){
		fn = "AVG";
	} else if(rangeName == 'cases'){
		value = 1;
	}else {
		//stay safe
		return;
	}

	//domainCondition creates an SQL query for a wide domain example:
		//COUNT(CASE WHEN month = '2011-6-1' THEN 1 END)
	function domainCondition(i){
		var condition = "";
		var params = {};
		if(domainName == 'none'){
			condition += "1=1";
		}
		if(domainName == 'camera' || domainName == 'month'){
			condition += domainName + " = ${domain_value_" + i + "}";
			params["domain_value_" + i] = domain[i];
		}
		if(domainName == 'law'){
			condition += "(law_legislation = ${domain_value_legislation_" + i + "}";
			params["domain_value_legislation_" + i] = domain[i].legislation;
			condition += " AND law_section = ${domain_value_section_" + i + "})";
			params["domain_value_section_" + i] = domain[i].section;
		}
		return {condition, params}
	}

	//datasetQuery creates an SQL query for a wide domain example
		//SELECT COUNT(CASE WHEN month = '2011-6-1' THEN 1 END)
	//one of the above for every domain value (month/camera/law)
		//WHERE ~~~~~
	//and it joins the standard WHERE from the query JSON
	function datasetQuery(query){
		var select = "SELECT";
		var params = {};
		var builtConditions = generateConditions(query);
		for(var paramsk in builtConditions.params){
			if (!builtConditions.params.hasOwnProperty(paramsk)) continue;
			params[paramsk]=builtConditions.params[paramsk];
		}
		for(var i = 0; i < domain.length; i++){
			params["domain_value_" + i] = domain[i];
			var dcond = domainCondition(i);
			for(var paramsk in dcond.params){
				if (!dcond.params.hasOwnProperty(paramsk)) continue;
				params[paramsk]=dcond.params[paramsk];
			}
			select += " " + fn + "(CASE WHEN " + dcond.condition + " THEN " + value + " END) AS " + domainName + "_" + i;
			if(i != domain.length-1) select += ",";
		}
		select += " FROM offence" + (builtConditions.conditions.length?' WHERE ':'') + builtConditions.conditions.join(" AND ") + ";"
		console.log(select, params);
		return {select, params};
	}

	

	var querystart;
	db.tx(t => {
		var batch = [];
		//run each all of the queries as a batch through a single connection
		for(var queryid in queries){
			if(isNaN(queryid)) continue;
			if (!queries.hasOwnProperty(queryid)) continue;
			var a = datasetQuery(queries[queryid]);
			batch.push(t.any(a.select, a.params))
		}
		querystart = new Date();
        return t.batch(batch);
    })
    .then(data => {
    	//build the response data
    	var count = 0;
    	var response = {domain, domainName, fn, rangeName, dataSets: {}};
        for(var queryid in queries){
			if(isNaN(queryid)) continue;
			if (!queries.hasOwnProperty(queryid)) continue;
			response.dataSets[queryid] = data[count][0];
			console.log(queryid, data[count][0]);
			count++;
		}
		//debug print some performance data
		console.log(response);
		console.log("Total Took", new Date() - start, "ms");
		console.log("Query Took", new Date() - querystart, "ms");
		res.send(response);
    })
    .catch(error => {
        console.log("SQL ERROR", error);
    });
	
});



//endpoint so the webpage knows what laws and cameras to populate the dropdown lists with
app.get('/api/query/setup', function (req, res) {
	db.tx(t => {
        return t.batch([
            t.any('SELECT legislation, section FROM law;', []),
            t.any('SELECT location_code, location_description, type FROM camera;', [])
        ]);
    })
    .then(data => {
        res.send({laws: data[0], cameras: data[1]});
    })
    .catch(error => {
        console.log("SQL ERROR", error);
    });
})

app.listen(7000);