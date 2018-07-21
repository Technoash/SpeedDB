//bodge function to download the list of laws/cameras to populate dropdown lists
function queryToolsetupFn($scope, apiFactory){
	$scope.setup = queryToolSetup;
	return new Promise(function(res, rej){
		if(!queryToolSetup){
			$scope.setup = {
				monthNames: monthNames,
				years: []
			};
			apiFactory.get('/api/query/setup')
			.then(function(setup){
				$scope.setup.laws = setup.data.laws;
				$scope.setup.cameras = setup.data.cameras;
				res();
			});
		    var currentyear = new Date().getFullYear();
		    for(var i = -20; i < 21; i++){
		    	$scope.setup.years.push(currentyear+i);
		    }
		    queryToolSetup = $scope.setup;
		}
	})
}

var queryToolSetup = false;

var isPosInt = function(str) {
	var n = Math.floor(Number(str));
	return String(n) === str && n >= 0;
}

var objSize = function(obj) {
	var size = 0, key;
	for (key in obj) {
		if (obj.hasOwnProperty(key)) size++;
	}
	return size;
};

var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];

//initialise the angular app
angular.module('speed', ['ngRoute', 'ui.select', 'ngSanitize'])
.config(function($routeProvider, $locationProvider) {
	//tell angular where the code for each page is
	$routeProvider
	  .when('/query/new', {
		templateUrl: 'templates/query_tool.html',
		controller: 'QueryToolCtrl',
		controllerAs: 'queryTool'
	  })
	  .when('/query/edit/:id', {
		templateUrl: 'templates/query_tool.html',
		controller: 'QueryToolCtrl',
		controllerAs: 'queryTool',
		editSearch: true
	  })
	  .when('/search', {
		templateUrl: 'templates/search.html',
		controller: 'SearchCtrl',
		controllerAs: 'search'
	  })
	  .when('/graph', {
		templateUrl: 'templates/graph.html',
		controller: 'GraphCtrl',
		controllerAs: 'graph'
	  })
	$locationProvider.html5Mode(false).hashPrefix('!');
})

.controller('MainCtrl',function MainCtrl($scope, $route, $routeParams, $location, pageTitle) {
	$scope.pageTitle = pageTitle;
	this.$route = $route;
	this.$location = $location;
	this.$routeParams = $routeParams;
})

//controller for the query tool
.controller('QueryToolCtrl', function QueryToolCtrl($scope, $routeParams, $http, $location, apiFactory, dataSetStore, $route, $routeParams, pageTitle) {
	//the word "query" in this controller means "query model"

	$scope.editSearch = $route.current.$$route.editSearch;
	//try to get the model ID from the URL
	$scope.editSearchId = $routeParams.id;

	//if successful
	if($scope.editSearch){
		pageTitle.setTitle("Edit Query");
		$scope.query = dataSetStore.getModel($scope.editSearchId);
		console.log($scope.query);
		if(!$scope.query) $location.path('query/new');
	}else{
		pageTitle.setTitle("New Query");
		$scope.query = dataSetStore.getSearchModel();
	}
	
	//resets the model
	$scope.reset_query = function(){
		$scope.query = {
			name: "",
			fine_from: "",
			fine_to: "",
			speed_filter: {
		    	'10-': false,
		    	'10+': false,
		    	'20+': false,
		    	'30+': false,
		    	'45+': false
		    },
			offence_type: "none",
			laws: [],
			month: {
		    	to: {},
		    	from: {}
		    },
		    cameras: []
		};
	}

	//if this isn't an edit, initialise the new query model
	if(!$scope.query){
		$scope.reset_query();
	}


	queryToolsetupFn($scope, apiFactory);

	$scope.isPosInt = isPosInt;

    $scope.offence_type_change = function(type){
    	if(type != 'red') return;
    	$scope.query.speed_filter = {
	    	'10-': false,
	    	'10+': false,
	    	'20+': false,
	    	'30+': false,
	    	'45+': false
	    };
    }

	$scope.add_to_graph = function(){
		dataSetStore.addDataSet($scope.query);
		$location.path('graph');
	}
	$scope.update_graph_query = function(){
		dataSetStore.updateDataSet($scope.editSearchId, $scope.query);
		$location.path('graph');
	}
	$scope.search = function(){
    	dataSetStore.updateSearchDataSet($scope.query);
		$location.path('search');
    }
})



.controller('SearchCtrl', function SearchCtrl($scope, $routeParams, $http, dataSetStore, apiFactory, pageTitle) {
	pageTitle.setTitle("Search Results");
	$scope.responded = false;
	$scope.query = dataSetStore.getSearchQuery();
	$scope.results = [];

	if($scope.query){
		apiFactory.post('/api/search', $scope.query)
		.then(function(result){
			$scope.results = result.data;
			$scope.responded = true;
		});
	}

	$scope.formatMonth = function(da){
		var month = new Date(da);
		
		return monthNames[month.getMonth()] + " " + month.getFullYear();

	}
})


.controller('GraphCtrl', function GraphCtrl($scope, $routeParams, $http, apiFactory, dataSetStore, $location, pageTitle, distinctColour) {
	pageTitle.setTitle("Graph Creator");
	queryToolsetupFn($scope, apiFactory);

	//on load, query delete, query add we need to reload the queries
	function refreshQueries(){
		$scope.query_colours = {};
		$scope.queries = dataSetStore.getQueries();
		$scope.n_queries = objSize($scope.queries);
		$scope.display_viewed = null;
		for(var queryid in $scope.queries){
			if (!$scope.queries.hasOwnProperty(queryid)) continue;
			$scope.query_colours[queryid] = distinctColour.get();
		}
	}
	refreshQueries();

	var chart;

	$scope.domain = {
		domainName: 'none',
		cameras: [],
		camera_colours: [],
		laws: [],
		law_colours: [],
		months: {
			to: {},
			from: {}
		}
	}

	$scope.range = {
		rangeName: 'cases'
	};
	
	$scope.set_display_query = function(id){
		if($scope.display_viewed == id) return $scope.display_viewed = null;
		$scope.display_viewed = id;
	}
	$scope.edit_query = function(id){
		$location.path('/query/edit/'+id);
	}
	$scope.delete_query = function(id){
		dataSetStore.deleteDataSet(id);
	}

	$scope.name_query = function(id){
		var name = prompt("Please enter a name for this query", $scope.queries[id].name);
		if (name == null || name == "") {
			alert("Invalid name");
			return;
		}
		dataSetStore.nameDataSet(id, name);
	}

	$scope.submit_graph = function(){
		if(typeof chart !== 'undefined') chart.destroy();

		//get the HTML canvas
		var c=document.getElementById("myChart");
		var ctx = c.getContext('2d');

		//show "Loading" text
		ctx.font="30px Verdana";
		var gradient=ctx.createLinearGradient(0,0,c.width,0);
		gradient.addColorStop("0","magenta");
		gradient.addColorStop("0.5","blue");
		gradient.addColorStop("1.0","red");
		ctx.fillStyle=gradient;
		ctx.fillText("Loading!",100,90);

		var domain = [''];
		//make array of cameras
		if($scope.domain.domainName == 'camera'){
			domain = [];
			for(var i = 0; i < $scope.domain.cameras.length; i++){
				domain.push($scope.domain.cameras[i].value.location_code);
			}
		}
		//make array of laws
		if($scope.domain.domainName == 'law'){
			domain = [];
			for(var i = 0; i < $scope.domain.laws.length; i++){
				domain.push({legislation: $scope.domain.laws[i].value.legislation, section: $scope.domain.laws[i].value.section});
			}
		}
		//make array of months between the from month and to month
		if($scope.domain.domainName == 'month'){
			domain = [];
			var year = parseInt($scope.domain.months.from.year); 
			var toyear = parseInt($scope.domain.months.to.year); 
			var month = parseInt($scope.domain.months.from.month); 
			var tomonth = parseInt($scope.domain.months.to.month); 
			while(1){
				domain.push(year+"-"+(month<10?"0":"")+month+"-01");
				month++;
				if(month == 13) {
					month = 1;
					year++;
				}
				if(year == toyear && month == tomonth){
					domain.push(year+"-"+(month<10?"0":"")+month+"-01");
					break;
				}
			}
		}
		//make the POST request for the graph data
		apiFactory.post('/api/graph', {queries: $scope.queries, rangeName: $scope.range.rangeName, domainName: $scope.domain.domainName, domain: domain})
		.then(function(data){
			var data = data.data;

			//build the labels for the x axis
			var labels = [];
			if($scope.domain.domainName == 'camera'){
				for(var a = 0; a < domain.length; a++){
					labels.push('camera');
				}
			}
			if($scope.domain.domainName == 'law'){
				for(var a = 0; a < domain.length; a++){
					labels.push(domain[a].legislation + " " + domain[a].section);
				}
			}

			if($scope.domain.domainName == 'month'){
				labels = data.domain;
			}
			if($scope.domain.domainName == 'none'){
				labels.push("");
			}
			
			
			var dataobj = {
				labels: labels,
				datasets: []
			}

			//add each dataset (cameras/laws/months) to the graph object
			for(var dataSetId in data.dataSets){
				if (!data.dataSets.hasOwnProperty(dataSetId)) continue;
				var queryName = dataSetId;
				var obj = {label: $scope.queries[queryName].name, data: []};
				//set the colour of the bar/line
				obj['backgroundColor'] = $scope.query_colours[queryName];
				if($scope.domain.domainName=='month'){
					obj['backgroundColor'] = distinctColour.translate($scope.query_colours[queryName], 0.3)
					obj['borderColor'] = distinctColour.translate($scope.query_colours[queryName], 0.7)
				}
				dataobj.datasets.push(obj);
				for(var dataSetColId in data.dataSets[dataSetId]){
					if (!data.dataSets[dataSetId].hasOwnProperty(dataSetColId)) continue;
					//month_0, month_1 <- use the number part as an index to access the real name of the month (like 2017-7-1)
					dataobj.datasets[dataobj.datasets.length-1].data[dataSetColId.split("_")[1]] = data.dataSets[dataSetId][dataSetColId];
				}
			}

			var xlabel = {camera: 'Cameras', law: 'Laws', none: 'Results', month: 'Time'};
			var ylabel = {'cases': '# cases', 'total_fine_value/cases': '($) avg fine/case', 'total_fine_value': '($) total fine amount'};
			chart = new Chart(ctx, {
			    type: ($scope.domain.domainName=='month'?'line':'bar'),
			    data: dataobj,
			    options: {
					scales: {
						xAxes: [{
							scaleLabel: {
								labelString: xlabel[$scope.domain.domainName],
								display: true
							},
							ticks: {
								autoSkip: false
							}
						}],
						yAxes: [{
							scaleLabel: {
								labelString: ylabel[$scope.range.rangeName],
								display: true
							},
							ticks: {
								beginAtZero: ($scope.domain.domainName=='month'?false:true)
							}
						}]
					}
				}
			});
		})
	}
})


.factory('apiFactory', function ($http, $q){
	var factory = {};
	factory.get = function(path){
		return $http.get(path);
	}
	factory.post = function(path, data){
		return $http.post(path, data);
	}

	return factory;
})

//stores the queries. allows queries to be stored between page changes
.factory('dataSetStore', function() {
	//this converts the query tool angular form model into a format that makes more sense to send across the internet
	//only keeps the relevant data and sets null anywhere there is no limit
	function generateQueryFromModel(model){
		var query = {
			month_from: null,
			month_to: null,
			laws: [],
			cameras: [],
			excess_speeds: [],
			red_light: null,
			individual_fine_value_from: null,
			individual_fine_value_to: null
		};
		if(model.month.from.month != "" && model.month.from.year != ""){
			query.month_from = {
				year: parseInt(model.month.from.year),
				month: parseInt(model.month.from.month)
			}
		}
		if(model.month.to.month != "" && model.month.to.year != ""){
			query.month_to = {
				year: parseInt(model.month.to.year),
				month: parseInt(model.month.to.month)
			}
		}
		if(model.offence_type == "speed"){
			query.red_light = false;
		}
		if(model.offence_type == "red"){
			query.red_light = true;
		}
		if(isPosInt(model.fine_from)){
			query.individual_fine_value_from = parseInt(model.fine_from);
		}
		if(isPosInt(model.fine_to)){
			query.individual_fine_value_to = parseInt(model.fine_to);
		}
		for(var i = 0; i < model.laws.length; i++){
			query.laws.push(model.laws[i].value);
		}
		for(var i = 0; i < model.cameras.length; i++){
			query.cameras.push(model.cameras[i].value.location_code);
		}
		for (var k in model.speed_filter){
			if (!model.speed_filter.hasOwnProperty(k)) continue;
			if(model.speed_filter[k]) query.excess_speeds.push(k);
		}
		query.name = model.name;
		return query;
	}

	var savedModels = {};
	var savedQueries = {};
	var savedSearchModel = null;
	var savedSearchQuery = null;
	var id = 0;

	//lots of getters and setters
	function addDataSet(model) {
		id++;
		deleteDataSet(id);
		savedQueries[id] = generateQueryFromModel(model);
		savedModels[id] = model;
		savedModels[id].name = id;
		savedQueries[id].name = id;
	}
	function nameDataSet(id, name) {
		savedModels[id].name = name;
		savedQueries[id].name = name;
	}
	function updateDataSet(id, model) {
		savedQueries[id] = generateQueryFromModel(model);
		savedModels[id] = model;
	}
	function deleteDataSet(id) {
		delete savedModels[id];
		delete savedQueries[id];
	}
	function getQueries() {
		return savedQueries;
	}
	function getModel(id) {
		return savedModels[id];
	}
	function getQuery(id) {
		return savedQueries[id];
	}
	function updateSearchDataSet(model) {
		savedSearchQuery = generateQueryFromModel(model);
		savedSearchModel = model;
	}
	function getSearchQuery() {
		return savedSearchQuery;
	}
	function getSearchModel() {
		return savedSearchModel;
	}
	return {
		addDataSet: addDataSet,
		getQueries: getQueries,
		getModel: getModel,
		deleteDataSet: deleteDataSet,
		getQuery: getQuery,
		updateSearchDataSet: updateSearchDataSet,
		getSearchQuery: getSearchQuery,
		getSearchModel: getSearchModel,
		updateDataSet: updateDataSet,
		nameDataSet: nameDataSet
	}
})
.directive('querydisplay', function () {
return {
    restrict: 'E',
    scope: {query : '=', hide: '=?'},
    templateUrl: '/templates/querydisplay.html',
    controller: function ($scope, $attrs) {
    	$scope.hidden = true;
    	$scope.size = 11;
    	$scope.size_increase = function(){
    		$scope.size++;
    	}
    	$scope.size_decrease = function(){
    		$scope.size--;
    	}
    	$scope.toggle = function(){
    		$scope.hidden = !$scope.hidden;
    	}
    }
}
})
//the custom <monthinput></monthinput> month selector tag
.directive('monthinput', function () {
return {
    restrict: 'E',
    scope: {month : '=', setup: '='},
    templateUrl: '/templates/monthinput.html',
    controller: function ($scope, $attrs) {
    	$scope.month = {
			year: "",
			month: ""
		}
	    $scope.month_change = function(month){
	    	if($scope.month[(month?"month":"year")] == ""){
	    		$scope.month[(month?"year":"month")] = "";
	    	}else{
	    		if($scope.month[(month?"year":"month")] == "")
				$scope.month[(month?"year":"month")] = ""+(month?new Date().getFullYear():new Date().getMonth()+1);
	    	}
	    }
    }
}
})
//the custom <camerainput></camerainput> dropdown tag
.directive('camerainput', function () {
return {
    restrict: 'E',
    scope: {cameras : '=', setup: '=', action: '@', colours: '=?'},
    templateUrl: '/templates/camerainput.html',
    controller: function ($scope, $attrs, distinctColour) {
	    $scope.add_camera = function(){
	    	$scope.cameras.push({ value: $scope.setup.cameras[Math.floor(Math.random() * $scope.setup.cameras.length)] });
	    	if($scope.colours){
	    		$scope.colours.push(distinctColour.get());
	    	}
	    }
	    $scope.remove_camera = function(i){
	    	$scope.cameras.splice(i, 1);
	    	if($scope.colours){
	    		$scope.colours.splice(i, 1);
	    	}
	    }
    }
}
})
//the custom <lawinput></lawinput> dropdown tag
.directive('lawinput', function () {
return {
    restrict: 'E',
    scope: {laws : '=', setup: '=', action: '@', colours: '=?'},
    templateUrl: '/templates/lawinput.html',
    controller: function ($scope, $attrs, distinctColour) {
		$scope.add_law = function(){
	    	$scope.laws.push({ value: $scope.setup.laws[Math.floor(Math.random() * $scope.setup.laws.length)] });
	    	console.log($scope.colours);
	    	if($scope.colours){
	    		$scope.colours.push(distinctColour.get());
	    	}
	    }
	    $scope.remove_law = function(i){
	    	$scope.laws.splice(i, 1);
	    	if($scope.colours){
	    		$scope.colours.splice(i, 1);
	    	}
	    }
    }
}
})
.factory('pageTitle', function() {
	var title = 'default';
	return {
		title: function() {
			return title;
		},
		setTitle: function(newTitle) {
			console.log(newTitle);
			title = newTitle;
		}
	};
})
//stores nice colours
.factory('distinctColour', function() {
	//nice colours
	var colours = ["#ff0009", "#0011cc", "#007306", "#330009", "#39e6af", "#ff80a6", "#554d99", 
	"#a3d9b2", "#4d664e", "#ff00b3", "#8c000c", "#003a59", "#3d5bf2", "#a330bf", "#8eff80", 
	"#592d4b", "#bf8f96", "#00c4ff", "#008077", "#580059", "#f23d4f", "#8c233f", "#608cbf", 
	"#1a2c33", "#7ca0a6", "#00e2f2", "#006680", "#083300", "#3d8bf2", "#1a1d66", "#a6538a", 
	"#f9bfff", "#857399"];
	//on site load, start at a random colour 
	var index = Math.floor(Math.random() * colours.length);
	return {
		//get the next colour
		get: function() {
			index++;
			if(index > colours.length-1) index = 0;
			return colours[index];
		},
		//convert HEX to rgba colour
		translate: function(hex, a){
			// https://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
		    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		    return "rgba(" + parseInt(result[1], 16) + ", " + parseInt(result[2], 16) + ", " + parseInt(result[3], 16) + ", " + a + ")"
		}
	};
});