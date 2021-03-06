var Gherkin = require('gherkin');
var parser = new Gherkin.Parser(new Gherkin.AstBuilder());
var IGNORE_TAGS = ["@ignore"];
var IGNORE_OTHER_TAGS = ["@ignoreOthers", "@only"];

var createFeaturePreprocessor = function (logger, basePath) {
  var log = logger.create('preprocessor.feature');

  function sanitizeString(str) {
    return str.replace(/'/g, '\\\'').replace(/[\ \t]*[\n\r]+[\ \t]*/g, "\\n\\r' + \n\r\t'");
  }

  function getFeatureTitle(feature) {
    var featureTitle = feature.name;
    if (feature.description) {
      featureTitle += "\r" + feature.description;
    }
    return sanitizeString(featureTitle);
  }

 function createTableArgumentsObj(step) {
		if (step.argument) {
            if (step.argument.type === "DocString") {
                return step.argument.content;
            } else if (step.argument.rows.length > 0) {
                var tableArg = [];
                var properties = [];
                step.argument.rows[0].cells.forEach(function (cell) {
                    properties.push(cell.value);
                })
        
                for (var j = 1; j < step.argument.rows.length; j++) {
                    var row = step.argument.rows[j];
                    var argument = {};
                    for (var k = 0; k < row.cells.length; k++) {
                        argument[properties[k]] = row.cells[k].value;
                    }
                    tableArg.push(argument);
                }
                return tableArg;   
            }
		}
		return null;
	}


  function getScenarioTemplate(scenario, background) {
    var scenarioTemplate = "\n\t.scenario('" + sanitizeString(scenario.name) + "')";
    if(hasTag(scenario.tags, IGNORE_OTHER_TAGS)){
      scenarioTemplate += "\n\t.ignoreOthers()";
    }
     if (hasTag(scenario.tags, IGNORE_TAGS)) {
      scenarioTemplate += "\n\t.ignore()";
    }
    
    var previousKeyword = null;
    
    var steps = scenario.steps;
    if (background && background.steps){
      steps = background.steps.concat(scenario.steps);
    }
    
    steps.forEach(function (step) {
      var keyword = step.keyword.toLowerCase().trim();
      switch (keyword) {
        case "given":
        case "when":
        case "then":
          if (previousKeyword === keyword) {
            keyword = "and";
          }
          else {
            previousKeyword = keyword;
          }
          break;
        default:
          // And / But / ...
          keyword = "and";
      }
      scenarioTemplate += "\n\t\t." + keyword + "('" + sanitizeString(step.text) + "'";
      var tableArgObj = createTableArgumentsObj(step);
      if (tableArgObj !== null) {
        scenarioTemplate += "," + JSON.stringify(tableArgObj);
      }
      scenarioTemplate += ")";
    });
    return scenarioTemplate;
  }

  function formatScenarioTemplateWithSamples(scenario, scenarioTemplate) {
    if (scenario.examples) {
      var scenarii = '';
      scenario.examples[0].tableBody.forEach(function (exemple) {
        var exempleTemplate = scenarioTemplate;
        for (var i = 0; i < exemple.cells.length; i++) {
          var paramName = scenario.examples[0].tableHeader.cells[i].value;
          var value = exemple.cells[i].value;
          var re = new RegExp("<" + paramName.replace("'","\\\\'") + ">", "g");
          exempleTemplate = exempleTemplate.replace(re, value);
        }
        scenarii += exempleTemplate;
      });
      return scenarii
    } else {
      return scenarioTemplate;
    }
  }

  function hasTag(tags, tagNames) {
    return tags.some(function (tag) { return tagNames.indexOf(tag.name) >= 0 });
  }

  return function (content, file, done) {
    log.info('Processing "%s".', file.originalPath);
    var feature;
    try{
       feature = parser.parse(new Gherkin.TokenScanner(content), new Gherkin.TokenMatcher());
    }catch(error){
      log.error('Feature file is incorrect.', file.originalPath);
      log.error(JSON.stringify(error, null, 2));
      done("console.error('error parsing feature file', '" + file.originalPath + "')");
      return;
    }
    
    var featureSpec = "feature('" + getFeatureTitle(feature) + "')";
    if(hasTag(feature.tags, IGNORE_OTHER_TAGS)){
      featureSpec += "\n\t.ignoreOthers()";
    }
    if (hasTag(feature.tags, IGNORE_TAGS)) {
      featureSpec += "\n\t.ignore()";
    }
    
    feature.scenarioDefinitions.forEach(function (scenario) {
        var scenarioTemplate = getScenarioTemplate(scenario, feature.background);
        featureSpec += formatScenarioTemplateWithSamples(scenario, scenarioTemplate);
    });
    done(featureSpec);
  };
};

createFeaturePreprocessor.$inject = ['logger', 'config.basePath'];

module.exports = createFeaturePreprocessor;