(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof window === 'object') {
    // Browser globals (root is window)
    window.Gherkin = factory();
  } else {
    // Node.js/IO.js
    module.exports = factory();
  }
}(this, function () {
  return {
    Parser: require('./lib/gherkin/parser'),
    TokenScanner: require('./lib/gherkin/token_scanner'),
    TokenMatcher: require('./lib/gherkin/token_matcher'),
    AstBuilder: require('./lib/gherkin/ast_builder')
  };
}));

},{"./lib/gherkin/ast_builder":2,"./lib/gherkin/parser":7,"./lib/gherkin/token_matcher":9,"./lib/gherkin/token_scanner":10}],2:[function(require,module,exports){
var AstNode = require('./ast_node');
var Errors = require('./errors');

module.exports = function AstBuilder () {

  var stack = [new AstNode('None')];
  var comments = [];

  this.reset = function () {
    stack = [new AstNode('None')];
    comments = [];
  };

  this.startRule = function (ruleType) {
    stack.push(new AstNode(ruleType));
  };

  this.endRule = function (ruleType) {
    var node = stack.pop();
    var transformedNode = transformNode(node);
    currentNode().add(node.ruleType, transformedNode);
  };

  this.build = function (token) {
    if(token.matchedType === 'Comment') {
      comments.push({
        type: 'Comment',
        location: getLocation(token),
        text: token.matchedText
      });
    } else {
      currentNode().add(token.matchedType, token);
    }
  };

  this.getResult = function () {
    return currentNode().getSingle('Feature');
  };

  function currentNode () {
    return stack[stack.length - 1];
  }

  function getLocation (token, column) {
    return !column ? token.location : {line: token.location.line, column: column};
  }

  function getTags (node) {
    var tags = [];
    var tagsNode = node.getSingle('Tags');
    if (!tagsNode) return tags;
    tagsNode.getTokens('TagLine').forEach(function (token) {
      token.matchedItems.forEach(function (tagItem) {
        tags.push({
          type: 'Tag',
          location: getLocation(token, tagItem.column),
          name: tagItem.text
        });
      });

    });
    return tags;
  }

  function getCells(tableRowToken) {
    return tableRowToken.matchedItems.map(function (cellItem) {
      return {
        type: 'TableCell',
        location: getLocation(tableRowToken, cellItem.column),
        value: cellItem.text
      }
    });
  }

  function getDescription (node) {
    return node.getSingle('Description');
  }

  function getSteps (node) {
    return node.getItems('Step');
  }

  function getTableRows(node) {
    var rows = node.getTokens('TableRow').map(function (token) {
      return {
        type: 'TableRow',
        location: getLocation(token),
        cells: getCells(token)
      };
    });
    ensureCellCount(rows);
    return rows;
  }

  function ensureCellCount(rows) {
    if(rows.length == 0) return;
    var cellCount = rows[0].cells.length;

    rows.forEach(function (row) {
      if (row.cells.length != cellCount) {
        throw Errors.AstBuilderException.create("inconsistent cell count within the table", row.location);
      }
    });
  }

  function transformNode(node) {
    switch(node.ruleType) {
      case 'Step':
        var stepLine = node.getToken('StepLine');
        var stepArgument = node.getSingle('DataTable') || node.getSingle('DocString') || undefined;

        return {
          type: node.ruleType,
          location: getLocation(stepLine),
          keyword: stepLine.matchedKeyword,
          text: stepLine.matchedText,
          argument: stepArgument
        }
      case 'DocString':
        var separatorToken = node.getTokens('DocStringSeparator')[0];
        var contentType = separatorToken.matchedText;
        var lineTokens = node.getTokens('Other');
        var content = lineTokens.map(function (t) {return t.matchedText}).join("\n");

        return {
          type: node.ruleType,
          location: getLocation(separatorToken),
          contentType: contentType,
          content: content
        };
      case 'DataTable':
        var rows = getTableRows(node);
        return {
          type: node.ruleType,
          location: rows[0].location,
          rows: rows,
        }
      case 'Background':
        var backgroundLine = node.getToken('BackgroundLine');
        var description = getDescription(node);
        var steps = getSteps(node);

        return {
          type: node.ruleType,
          location: getLocation(backgroundLine),
          keyword: backgroundLine.matchedKeyword,
          name: backgroundLine.matchedText,
          description: description,
          steps: steps
        };
      case 'Scenario_Definition':
        var tags = getTags(node);
        var scenarioNode = node.getSingle('Scenario');
        if(scenarioNode) {
          var scenarioLine = scenarioNode.getToken('ScenarioLine');
          var description = getDescription(scenarioNode);
          var steps = getSteps(scenarioNode);

          return {
            type: scenarioNode.ruleType,
            tags: tags,
            location: getLocation(scenarioLine),
            keyword: scenarioLine.matchedKeyword,
            name: scenarioLine.matchedText,
            description: description,
            steps: steps
          };
        } else {
          var scenarioOutlineNode = node.getSingle('ScenarioOutline');
          if(!scenarioOutlineNode) throw new Error('Internal grammar error');

          var scenarioOutlineLine = scenarioOutlineNode.getToken('ScenarioOutlineLine');
          var description = getDescription(scenarioOutlineNode);
          var steps = getSteps(scenarioOutlineNode);
          var examples = scenarioOutlineNode.getItems('Examples_Definition');

          return {
            type: scenarioOutlineNode.ruleType,
            tags: tags,
            location: getLocation(scenarioOutlineLine),
            keyword: scenarioOutlineLine.matchedKeyword,
            name: scenarioOutlineLine.matchedText,
            description: description,
            steps: steps,
            examples: examples
          };
        }
      case 'Examples_Definition':
        var tags = getTags(node);
        var examplesNode = node.getSingle('Examples');
        var examplesLine = examplesNode.getToken('ExamplesLine');
        var description = getDescription(examplesNode);
        var rows = getTableRows(examplesNode)

        return {
          type: examplesNode.ruleType,
          tags: tags,
          location: getLocation(examplesLine),
          keyword: examplesLine.matchedKeyword,
          name: examplesLine.matchedText,
          description: description,
          tableHeader: rows[0],
          tableBody: rows.slice(1)
        };
      case 'Description':
        var lineTokens = node.getTokens('Other');
        // Trim trailing empty lines
        var end = lineTokens.length;
        while (end > 0 && lineTokens[end-1].line.trimmedLineText === '') {
            end--;
        }
        lineTokens = lineTokens.slice(0, end);

        var description = lineTokens.map(function (token) { return token.matchedText}).join("\n");
        return description;

      case 'Feature':
        var header = node.getSingle('Feature_Header');
        if(!header) return null;
        var tags = getTags(header);
        var featureLine = header.getToken('FeatureLine');
        if(!featureLine) return null;
        var background = node.getSingle('Background');
        var scenariodefinitions = node.getItems('Scenario_Definition');
        var description = getDescription(header);
        var language = featureLine.matchedGherkinDialect;

        return {
          type: node.ruleType,
          tags: tags,
          location: getLocation(featureLine),
          language: language,
          keyword: featureLine.matchedKeyword,
          name: featureLine.matchedText,
          description: description,
          background: background,
          scenarioDefinitions: scenariodefinitions,
          comments: comments
        };
      default:
        return node;
    }
  }

};

},{"./ast_node":3,"./errors":4}],3:[function(require,module,exports){
function AstNode (ruleType) {
  this.ruleType = ruleType;
  this._subItems = {};
}

AstNode.prototype.add = function (ruleType, obj) {
  var items = this._subItems[ruleType];
  if(items === undefined) this._subItems[ruleType] = items = [];
  items.push(obj);
}

AstNode.prototype.getSingle = function (ruleType) {
  return (this._subItems[ruleType] || [])[0];
}

AstNode.prototype.getItems = function (ruleType) {
  return this._subItems[ruleType] || [];
}

AstNode.prototype.getToken = function (tokenType) {
  return this.getSingle(tokenType);
}

AstNode.prototype.getTokens = function (tokenType) {
  return this._subItems[tokenType] || [];
}

module.exports = AstNode;

},{}],4:[function(require,module,exports){
var Errors = {};

[
  'ParserException',
  'CompositeParserException',
  'UnexpectedTokenException',
  'UnexpectedEOFException',
  'AstBuilderException',
  'NoSuchLanguageException'
].forEach(function (name) {

  function ErrorProto (message) {
    this.message = message || ('Unspecified ' + name);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, arguments.callee);
    }
  }

  ErrorProto.prototype = Object.create(Error.prototype);
  ErrorProto.prototype.name = name;
  ErrorProto.prototype.constructor = ErrorProto;
  Errors[name] = ErrorProto;
});

Errors.CompositeParserException.create = function(errors) {
  var message = "Parser errors:\n" + errors.map(function (e) { return e.message; }).join("\n");
  var err = new Errors.CompositeParserException(message);
  err.errors = errors;
  return err;
};

Errors.UnexpectedTokenException.create = function(token, expectedTokenTypes, stateComment) {
  var message = "expected: " + expectedTokenTypes.join(', ') + ", got '" + token.getTokenValue().trim() + "'";
  var location = !token.location.column
    ? {line: token.location.line, column: token.line.indent + 1 }
    : token.location;
  return createError(Errors.UnexpectedEOFException, message, location);
};

Errors.UnexpectedEOFException.create = function(token, expectedTokenTypes, stateComment) {
  var message = "unexpected end of file, expected: " + expectedTokenTypes.join(', ');
  return createError(Errors.UnexpectedTokenException, message, token.location);
};

Errors.AstBuilderException.create = function(message, location) {
  return createError(Errors.AstBuilderException, message, location);
};

Errors.NoSuchLanguageException.create = function(language, location) {
  var message = "Language not supported: " + language;
  return createError(Errors.NoSuchLanguageException, message, location);
};

function createError(Ctor, message, location) {
  var fullMessage = "(" + location.line + ":" + location.column + "): " + message;
  var error = new Ctor(fullMessage);
  error.location = location;
  return error;
}

module.exports = Errors;

},{}],5:[function(require,module,exports){
module.exports={
  "af": {
    "and": [
      "* ",
      "En "
    ],
    "background": [
      "Agtergrond"
    ],
    "but": [
      "* ",
      "Maar "
    ],
    "examples": [
      "Voorbeelde"
    ],
    "feature": [
      "Funksie",
      "Besigheid Behoefte",
      "VermoÃ«"
    ],
    "given": [
      "* ",
      "Gegewe "
    ],
    "name": "Afrikaans",
    "native": "Afrikaans",
    "scenario": [
      "Situasie"
    ],
    "scenarioOutline": [
      "Situasie Uiteensetting"
    ],
    "then": [
      "* ",
      "Dan "
    ],
    "when": [
      "* ",
      "Wanneer "
    ]
  },
  "am": {
    "and": [
      "* ",
      "ÔµÕ¾ "
    ],
    "background": [
      "Ô¿Õ¸Õ¶Õ¿Õ¥Ö„Õ½Õ¿"
    ],
    "but": [
      "* ",
      "Ô²Õ¡ÕµÖ "
    ],
    "examples": [
      "Õ•Ö€Õ«Õ¶Õ¡Õ¯Õ¶Õ¥Ö€"
    ],
    "feature": [
      "Õ–Õ¸Ö‚Õ¶Õ¯ÖÕ«Õ¸Õ¶Õ¡Õ¬Õ¸Ö‚Õ©ÕµÕ¸Ö‚Õ¶",
      "Õ€Õ¡Õ¿Õ¯Õ¸Ö‚Õ©ÕµÕ¸Ö‚Õ¶"
    ],
    "given": [
      "* ",
      "Ô´Õ«ÖÕ¸Ö‚Ö„ "
    ],
    "name": "Armenian",
    "native": "Õ°Õ¡ÕµÕ¥Ö€Õ¥Õ¶",
    "scenario": [
      "ÕÖÕ¥Õ¶Õ¡Ö€"
    ],
    "scenarioOutline": [
      "ÕÖÕ¥Õ¶Õ¡Ö€Õ« Õ¯Õ¡Õ¼Õ¸Ö‚ÖÕ¾Õ¡ÖÖ„Õ¨"
    ],
    "then": [
      "* ",
      "Ô±ÕºÕ¡ "
    ],
    "when": [
      "* ",
      "ÔµÕ©Õ¥ ",
      "ÔµÖ€Õ¢ "
    ]
  },
  "ar": {
    "and": [
      "* ",
      "Ùˆ "
    ],
    "background": [
      "Ø§Ù„Ø®Ù„ÙÙŠØ©"
    ],
    "but": [
      "* ",
      "Ù„ÙƒÙ† "
    ],
    "examples": [
      "Ø§Ù…Ø«Ù„Ø©"
    ],
    "feature": [
      "Ø®Ø§ØµÙŠØ©"
    ],
    "given": [
      "* ",
      "Ø¨ÙØ±Ø¶ "
    ],
    "name": "Arabic",
    "native": "Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©",
    "scenario": [
      "Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ"
    ],
    "scenarioOutline": [
      "Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ Ù…Ø®Ø·Ø·"
    ],
    "then": [
      "* ",
      "Ø§Ø°Ø§Ù‹ ",
      "Ø«Ù… "
    ],
    "when": [
      "* ",
      "Ù…ØªÙ‰ ",
      "Ø¹Ù†Ø¯Ù…Ø§ "
    ]
  },
  "bg": {
    "and": [
      "* ",
      "Ð˜ "
    ],
    "background": [
      "ÐŸÑ€ÐµÐ´Ð¸ÑÑ‚Ð¾Ñ€Ð¸Ñ"
    ],
    "but": [
      "* ",
      "ÐÐ¾ "
    ],
    "examples": [
      "ÐŸÑ€Ð¸Ð¼ÐµÑ€Ð¸"
    ],
    "feature": [
      "Ð¤ÑƒÐ½ÐºÑ†Ð¸Ð¾Ð½Ð°Ð»Ð½Ð¾ÑÑ‚"
    ],
    "given": [
      "* ",
      "Ð”Ð°Ð´ÐµÐ½Ð¾ "
    ],
    "name": "Bulgarian",
    "native": "Ð±ÑŠÐ»Ð³Ð°Ñ€ÑÐºÐ¸",
    "scenario": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ð¹"
    ],
    "scenarioOutline": [
      "Ð Ð°Ð¼ÐºÐ° Ð½Ð° ÑÑ†ÐµÐ½Ð°Ñ€Ð¸Ð¹"
    ],
    "then": [
      "* ",
      "Ð¢Ð¾ "
    ],
    "when": [
      "* ",
      "ÐšÐ¾Ð³Ð°Ñ‚Ð¾ "
    ]
  },
  "bm": {
    "and": [
      "* ",
      "Dan "
    ],
    "background": [
      "Latar Belakang"
    ],
    "but": [
      "* ",
      "Tetapi ",
      "Tapi "
    ],
    "examples": [
      "Contoh"
    ],
    "feature": [
      "Fungsi"
    ],
    "given": [
      "* ",
      "Diberi ",
      "Bagi "
    ],
    "name": "Malay",
    "native": "Bahasa Melayu",
    "scenario": [
      "Senario",
      "Situai",
      "Keadaan"
    ],
    "scenarioOutline": [
      "Template Senario",
      "Template Situai",
      "Template Keadaan",
      "Menggariskan Senario"
    ],
    "then": [
      "* ",
      "Maka ",
      "Kemudian "
    ],
    "when": [
      "* ",
      "Apabila "
    ]
  },
  "ca": {
    "and": [
      "* ",
      "I "
    ],
    "background": [
      "Rerefons",
      "Antecedents"
    ],
    "but": [
      "* ",
      "PerÃ² "
    ],
    "examples": [
      "Exemples"
    ],
    "feature": [
      "CaracterÃ­stica",
      "Funcionalitat"
    ],
    "given": [
      "* ",
      "Donat ",
      "Donada ",
      "AtÃ¨s ",
      "Atesa "
    ],
    "name": "Catalan",
    "native": "catalÃ ",
    "scenario": [
      "Escenari"
    ],
    "scenarioOutline": [
      "Esquema de l'escenari"
    ],
    "then": [
      "* ",
      "Aleshores ",
      "Cal "
    ],
    "when": [
      "* ",
      "Quan "
    ]
  },
  "cs": {
    "and": [
      "* ",
      "A takÃ© ",
      "A "
    ],
    "background": [
      "PozadÃ­",
      "Kontext"
    ],
    "but": [
      "* ",
      "Ale "
    ],
    "examples": [
      "PÅ™Ã­klady"
    ],
    "feature": [
      "PoÅ¾adavek"
    ],
    "given": [
      "* ",
      "Pokud ",
      "Za pÅ™edpokladu "
    ],
    "name": "Czech",
    "native": "ÄŒesky",
    "scenario": [
      "ScÃ©nÃ¡Å™"
    ],
    "scenarioOutline": [
      "NÃ¡Ärt ScÃ©nÃ¡Å™e",
      "Osnova scÃ©nÃ¡Å™e"
    ],
    "then": [
      "* ",
      "Pak "
    ],
    "when": [
      "* ",
      "KdyÅ¾ "
    ]
  },
  "cy-GB": {
    "and": [
      "* ",
      "A "
    ],
    "background": [
      "Cefndir"
    ],
    "but": [
      "* ",
      "Ond "
    ],
    "examples": [
      "Enghreifftiau"
    ],
    "feature": [
      "Arwedd"
    ],
    "given": [
      "* ",
      "Anrhegedig a "
    ],
    "name": "Welsh",
    "native": "Cymraeg",
    "scenario": [
      "Scenario"
    ],
    "scenarioOutline": [
      "Scenario Amlinellol"
    ],
    "then": [
      "* ",
      "Yna "
    ],
    "when": [
      "* ",
      "Pryd "
    ]
  },
  "da": {
    "and": [
      "* ",
      "Og "
    ],
    "background": [
      "Baggrund"
    ],
    "but": [
      "* ",
      "Men "
    ],
    "examples": [
      "Eksempler"
    ],
    "feature": [
      "Egenskab"
    ],
    "given": [
      "* ",
      "Givet "
    ],
    "name": "Danish",
    "native": "dansk",
    "scenario": [
      "Scenarie"
    ],
    "scenarioOutline": [
      "Abstrakt Scenario"
    ],
    "then": [
      "* ",
      "SÃ¥ "
    ],
    "when": [
      "* ",
      "NÃ¥r "
    ]
  },
  "de": {
    "and": [
      "* ",
      "Und "
    ],
    "background": [
      "Grundlage"
    ],
    "but": [
      "* ",
      "Aber "
    ],
    "examples": [
      "Beispiele"
    ],
    "feature": [
      "FunktionalitÃ¤t"
    ],
    "given": [
      "* ",
      "Angenommen ",
      "Gegeben sei ",
      "Gegeben seien "
    ],
    "name": "German",
    "native": "Deutsch",
    "scenario": [
      "Szenario"
    ],
    "scenarioOutline": [
      "Szenariogrundriss"
    ],
    "then": [
      "* ",
      "Dann "
    ],
    "when": [
      "* ",
      "Wenn "
    ]
  },
  "el": {
    "and": [
      "* ",
      "ÎšÎ±Î¹ "
    ],
    "background": [
      "Î¥Ï€ÏŒÎ²Î±Î¸ÏÎ¿"
    ],
    "but": [
      "* ",
      "Î‘Î»Î»Î¬ "
    ],
    "examples": [
      "Î Î±ÏÎ±Î´ÎµÎ¯Î³Î¼Î±Ï„Î±",
      "Î£ÎµÎ½Î¬ÏÎ¹Î±"
    ],
    "feature": [
      "Î”Ï…Î½Î±Ï„ÏŒÏ„Î·Ï„Î±",
      "Î›ÎµÎ¹Ï„Î¿Ï…ÏÎ³Î¯Î±"
    ],
    "given": [
      "* ",
      "Î”ÎµÎ´Î¿Î¼Î­Î½Î¿Ï… "
    ],
    "name": "Greek",
    "native": "Î•Î»Î»Î·Î½Î¹ÎºÎ¬",
    "scenario": [
      "Î£ÎµÎ½Î¬ÏÎ¹Î¿"
    ],
    "scenarioOutline": [
      "Î ÎµÏÎ¹Î³ÏÎ±Ï†Î® Î£ÎµÎ½Î±ÏÎ¯Î¿Ï…"
    ],
    "then": [
      "* ",
      "Î¤ÏŒÏ„Îµ "
    ],
    "when": [
      "* ",
      "ÎŒÏ„Î±Î½ "
    ]
  },
  "en": {
    "and": [
      "* ",
      "And "
    ],
    "background": [
      "Background"
    ],
    "but": [
      "* ",
      "But "
    ],
    "examples": [
      "Examples",
      "Scenarios"
    ],
    "feature": [
      "Feature",
      "Business Need",
      "Ability"
    ],
    "given": [
      "* ",
      "Given "
    ],
    "name": "English",
    "native": "English",
    "scenario": [
      "Scenario"
    ],
    "scenarioOutline": [
      "Scenario Outline",
      "Scenario Template"
    ],
    "then": [
      "* ",
      "Then "
    ],
    "when": [
      "* ",
      "When "
    ]
  },
  "en-Scouse": {
    "and": [
      "* ",
      "An "
    ],
    "background": [
      "Dis is what went down"
    ],
    "but": [
      "* ",
      "Buh "
    ],
    "examples": [
      "Examples"
    ],
    "feature": [
      "Feature"
    ],
    "given": [
      "* ",
      "Givun ",
      "Youse know when youse got "
    ],
    "name": "Scouse",
    "native": "Scouse",
    "scenario": [
      "The thing of it is"
    ],
    "scenarioOutline": [
      "Wharrimean is"
    ],
    "then": [
      "* ",
      "Dun ",
      "Den youse gotta "
    ],
    "when": [
      "* ",
      "Wun ",
      "Youse know like when "
    ]
  },
  "en-au": {
    "and": [
      "* ",
      "Too right "
    ],
    "background": [
      "First off"
    ],
    "but": [
      "* ",
      "Yeah nah "
    ],
    "examples": [
      "You'll wanna"
    ],
    "feature": [
      "Pretty much"
    ],
    "given": [
      "* ",
      "Y'know "
    ],
    "name": "Australian",
    "native": "Australian",
    "scenario": [
      "Awww, look mate"
    ],
    "scenarioOutline": [
      "Reckon it's like"
    ],
    "then": [
      "* ",
      "But at the end of the day I reckon "
    ],
    "when": [
      "* ",
      "It's just unbelievable "
    ]
  },
  "en-lol": {
    "and": [
      "* ",
      "AN "
    ],
    "background": [
      "B4"
    ],
    "but": [
      "* ",
      "BUT "
    ],
    "examples": [
      "EXAMPLZ"
    ],
    "feature": [
      "OH HAI"
    ],
    "given": [
      "* ",
      "I CAN HAZ "
    ],
    "name": "LOLCAT",
    "native": "LOLCAT",
    "scenario": [
      "MISHUN"
    ],
    "scenarioOutline": [
      "MISHUN SRSLY"
    ],
    "then": [
      "* ",
      "DEN "
    ],
    "when": [
      "* ",
      "WEN "
    ]
  },
  "en-old": {
    "and": [
      "* ",
      "Ond ",
      "7 "
    ],
    "background": [
      "Aer",
      "Ã†r"
    ],
    "but": [
      "* ",
      "Ac "
    ],
    "examples": [
      "Se the",
      "Se Ã¾e",
      "Se Ã°e"
    ],
    "feature": [
      "Hwaet",
      "HwÃ¦t"
    ],
    "given": [
      "* ",
      "Thurh ",
      "Ãžurh ",
      "Ãurh "
    ],
    "name": "Old English",
    "native": "Englisc",
    "scenario": [
      "Swa"
    ],
    "scenarioOutline": [
      "Swa hwaer swa",
      "Swa hwÃ¦r swa"
    ],
    "then": [
      "* ",
      "Tha ",
      "Ãža ",
      "Ãa ",
      "Tha the ",
      "Ãža Ã¾e ",
      "Ãa Ã°e "
    ],
    "when": [
      "* ",
      "Tha ",
      "Ãža ",
      "Ãa "
    ]
  },
  "en-pirate": {
    "and": [
      "* ",
      "Aye "
    ],
    "background": [
      "Yo-ho-ho"
    ],
    "but": [
      "* ",
      "Avast! "
    ],
    "examples": [
      "Dead men tell no tales"
    ],
    "feature": [
      "Ahoy matey!"
    ],
    "given": [
      "* ",
      "Gangway! "
    ],
    "name": "Pirate",
    "native": "Pirate",
    "scenario": [
      "Heave to"
    ],
    "scenarioOutline": [
      "Shiver me timbers"
    ],
    "then": [
      "* ",
      "Let go and haul "
    ],
    "when": [
      "* ",
      "Blimey! "
    ]
  },
  "eo": {
    "and": [
      "* ",
      "Kaj "
    ],
    "background": [
      "Fono"
    ],
    "but": [
      "* ",
      "Sed "
    ],
    "examples": [
      "Ekzemploj"
    ],
    "feature": [
      "Trajto"
    ],
    "given": [
      "* ",
      "DonitaÄµo ",
      "Komence "
    ],
    "name": "Esperanto",
    "native": "Esperanto",
    "scenario": [
      "Scenaro",
      "Kazo"
    ],
    "scenarioOutline": [
      "Konturo de la scenaro",
      "Skizo",
      "Kazo-skizo"
    ],
    "then": [
      "* ",
      "Do "
    ],
    "when": [
      "* ",
      "Se "
    ]
  },
  "es": {
    "and": [
      "* ",
      "Y ",
      "E "
    ],
    "background": [
      "Antecedentes"
    ],
    "but": [
      "* ",
      "Pero "
    ],
    "examples": [
      "Ejemplos"
    ],
    "feature": [
      "CaracterÃ­stica"
    ],
    "given": [
      "* ",
      "Dado ",
      "Dada ",
      "Dados ",
      "Dadas "
    ],
    "name": "Spanish",
    "native": "espaÃ±ol",
    "scenario": [
      "Escenario"
    ],
    "scenarioOutline": [
      "Esquema del escenario"
    ],
    "then": [
      "* ",
      "Entonces "
    ],
    "when": [
      "* ",
      "Cuando "
    ]
  },
  "et": {
    "and": [
      "* ",
      "Ja "
    ],
    "background": [
      "Taust"
    ],
    "but": [
      "* ",
      "Kuid "
    ],
    "examples": [
      "Juhtumid"
    ],
    "feature": [
      "Omadus"
    ],
    "given": [
      "* ",
      "Eeldades "
    ],
    "name": "Estonian",
    "native": "eesti keel",
    "scenario": [
      "Stsenaarium"
    ],
    "scenarioOutline": [
      "Raamstsenaarium"
    ],
    "then": [
      "* ",
      "Siis "
    ],
    "when": [
      "* ",
      "Kui "
    ]
  },
  "fa": {
    "and": [
      "* ",
      "Ùˆ "
    ],
    "background": [
      "Ø²Ù…ÛŒÙ†Ù‡"
    ],
    "but": [
      "* ",
      "Ø§Ù…Ø§ "
    ],
    "examples": [
      "Ù†Ù…ÙˆÙ†Ù‡ Ù‡Ø§"
    ],
    "feature": [
      "ÙˆÙÛŒÚ˜Ú¯ÛŒ"
    ],
    "given": [
      "* ",
      "Ø¨Ø§ ÙØ±Ø¶ "
    ],
    "name": "Persian",
    "native": "ÙØ§Ø±Ø³ÛŒ",
    "scenario": [
      "Ø³Ù†Ø§Ø±ÛŒÙˆ"
    ],
    "scenarioOutline": [
      "Ø§Ù„Ú¯ÙˆÛŒ Ø³Ù†Ø§Ø±ÛŒÙˆ"
    ],
    "then": [
      "* ",
      "Ø¢Ù†Ú¯Ø§Ù‡ "
    ],
    "when": [
      "* ",
      "Ù‡Ù†Ú¯Ø§Ù…ÛŒ "
    ]
  },
  "fi": {
    "and": [
      "* ",
      "Ja "
    ],
    "background": [
      "Tausta"
    ],
    "but": [
      "* ",
      "Mutta "
    ],
    "examples": [
      "Tapaukset"
    ],
    "feature": [
      "Ominaisuus"
    ],
    "given": [
      "* ",
      "Oletetaan "
    ],
    "name": "Finnish",
    "native": "suomi",
    "scenario": [
      "Tapaus"
    ],
    "scenarioOutline": [
      "Tapausaihio"
    ],
    "then": [
      "* ",
      "Niin "
    ],
    "when": [
      "* ",
      "Kun "
    ]
  },
  "fr": {
    "and": [
      "* ",
      "Et "
    ],
    "background": [
      "Contexte"
    ],
    "but": [
      "* ",
      "Mais "
    ],
    "examples": [
      "Exemples"
    ],
    "feature": [
      "FonctionnalitÃ©"
    ],
    "given": [
      "* ",
      "Soit ",
      "Etant donnÃ© ",
      "Etant donnÃ©e ",
      "Etant donnÃ©s ",
      "Etant donnÃ©es ",
      "Ã‰tant donnÃ© ",
      "Ã‰tant donnÃ©e ",
      "Ã‰tant donnÃ©s ",
      "Ã‰tant donnÃ©es "
    ],
    "name": "French",
    "native": "franÃ§ais",
    "scenario": [
      "ScÃ©nario"
    ],
    "scenarioOutline": [
      "Plan du scÃ©nario",
      "Plan du ScÃ©nario"
    ],
    "then": [
      "* ",
      "Alors "
    ],
    "when": [
      "* ",
      "Quand ",
      "Lorsque ",
      "Lorsqu'"
    ]
  },
  "ga": {
    "and": [
      "* ",
      "Agus"
    ],
    "background": [
      "CÃºlra"
    ],
    "but": [
      "* ",
      "Ach"
    ],
    "examples": [
      "SamplaÃ­"
    ],
    "feature": [
      "GnÃ©"
    ],
    "given": [
      "* ",
      "Cuir i gcÃ¡s go",
      "Cuir i gcÃ¡s nach",
      "Cuir i gcÃ¡s gur",
      "Cuir i gcÃ¡s nÃ¡r"
    ],
    "name": "Irish",
    "native": "Gaeilge",
    "scenario": [
      "CÃ¡s"
    ],
    "scenarioOutline": [
      "CÃ¡s Achomair"
    ],
    "then": [
      "* ",
      "Ansin"
    ],
    "when": [
      "* ",
      "Nuair a",
      "Nuair nach",
      "Nuair ba",
      "Nuair nÃ¡r"
    ]
  },
  "gj": {
    "and": [
      "* ",
      "àª…àª¨à«‡ "
    ],
    "background": [
      "àª¬à«‡àª•àª—à«àª°àª¾àª‰àª¨à«àª¡"
    ],
    "but": [
      "* ",
      "àªªàª£ "
    ],
    "examples": [
      "àª‰àª¦àª¾àª¹àª°àª£à«‹"
    ],
    "feature": [
      "àª²àª•à«àª·àª£",
      "àªµà«àª¯àª¾àªªàª¾àª° àªœàª°à«‚àª°",
      "àª•à«àª·àª®àª¤àª¾"
    ],
    "given": [
      "* ",
      "àª†àªªà«‡àª² àª›à«‡ "
    ],
    "name": "Gujarati",
    "native": "àª—à«àªœàª°àª¾àª¤à«€",
    "scenario": [
      "àª¸à«àª¥àª¿àª¤àª¿"
    ],
    "scenarioOutline": [
      "àªªàª°àª¿àª¦à«àª¦àª¶à«àª¯ àª°à«‚àªªàª°à«‡àª–àª¾",
      "àªªàª°àª¿àª¦à«àª¦àª¶à«àª¯ àª¢àª¾àª‚àªšà«‹"
    ],
    "then": [
      "* ",
      "àªªàª›à«€ "
    ],
    "when": [
      "* ",
      "àª•à«àª¯àª¾àª°à«‡ "
    ]
  },
  "gl": {
    "and": [
      "* ",
      "E "
    ],
    "background": [
      "Contexto"
    ],
    "but": [
      "* ",
      "Mais ",
      "Pero "
    ],
    "examples": [
      "Exemplos"
    ],
    "feature": [
      "CaracterÃ­stica"
    ],
    "given": [
      "* ",
      "Dado ",
      "Dada ",
      "Dados ",
      "Dadas "
    ],
    "name": "Galician",
    "native": "galego",
    "scenario": [
      "Escenario"
    ],
    "scenarioOutline": [
      "Esbozo do escenario"
    ],
    "then": [
      "* ",
      "EntÃ³n ",
      "Logo "
    ],
    "when": [
      "* ",
      "Cando "
    ]
  },
  "he": {
    "and": [
      "* ",
      "×•×’× "
    ],
    "background": [
      "×¨×§×¢"
    ],
    "but": [
      "* ",
      "××‘×œ "
    ],
    "examples": [
      "×“×•×’×ž××•×ª"
    ],
    "feature": [
      "×ª×›×•× ×”"
    ],
    "given": [
      "* ",
      "×‘×”×™× ×ª×Ÿ "
    ],
    "name": "Hebrew",
    "native": "×¢×‘×¨×™×ª",
    "scenario": [
      "×ª×¨×—×™×©"
    ],
    "scenarioOutline": [
      "×ª×‘× ×™×ª ×ª×¨×—×™×©"
    ],
    "then": [
      "* ",
      "××– ",
      "××–×™ "
    ],
    "when": [
      "* ",
      "×›××©×¨ "
    ]
  },
  "hi": {
    "and": [
      "* ",
      "à¤”à¤° ",
      "à¤¤à¤¥à¤¾ "
    ],
    "background": [
      "à¤ªà¥ƒà¤·à¥à¤ à¤­à¥‚à¤®à¤¿"
    ],
    "but": [
      "* ",
      "à¤ªà¤° ",
      "à¤ªà¤°à¤¨à¥à¤¤à¥ ",
      "à¤•à¤¿à¤¨à¥à¤¤à¥ "
    ],
    "examples": [
      "à¤‰à¤¦à¤¾à¤¹à¤°à¤£"
    ],
    "feature": [
      "à¤°à¥‚à¤ª à¤²à¥‡à¤–"
    ],
    "given": [
      "* ",
      "à¤…à¤—à¤° ",
      "à¤¯à¤¦à¤¿ ",
      "à¤šà¥‚à¤‚à¤•à¤¿ "
    ],
    "name": "Hindi",
    "native": "à¤¹à¤¿à¤‚à¤¦à¥€",
    "scenario": [
      "à¤ªà¤°à¤¿à¤¦à¥ƒà¤¶à¥à¤¯"
    ],
    "scenarioOutline": [
      "à¤ªà¤°à¤¿à¤¦à¥ƒà¤¶à¥à¤¯ à¤°à¥‚à¤ªà¤°à¥‡à¤–à¤¾"
    ],
    "then": [
      "* ",
      "à¤¤à¤¬ ",
      "à¤¤à¤¦à¤¾ "
    ],
    "when": [
      "* ",
      "à¤œà¤¬ ",
      "à¤•à¤¦à¤¾ "
    ]
  },
  "hr": {
    "and": [
      "* ",
      "I "
    ],
    "background": [
      "Pozadina"
    ],
    "but": [
      "* ",
      "Ali "
    ],
    "examples": [
      "Primjeri",
      "Scenariji"
    ],
    "feature": [
      "Osobina",
      "MoguÄ‡nost",
      "Mogucnost"
    ],
    "given": [
      "* ",
      "Zadan ",
      "Zadani ",
      "Zadano "
    ],
    "name": "Croatian",
    "native": "hrvatski",
    "scenario": [
      "Scenarij"
    ],
    "scenarioOutline": [
      "Skica",
      "Koncept"
    ],
    "then": [
      "* ",
      "Onda "
    ],
    "when": [
      "* ",
      "Kada ",
      "Kad "
    ]
  },
  "ht": {
    "and": [
      "* ",
      "Ak ",
      "Epi ",
      "E "
    ],
    "background": [
      "KontÃ¨ks",
      "Istorik"
    ],
    "but": [
      "* ",
      "Men "
    ],
    "examples": [
      "Egzanp"
    ],
    "feature": [
      "Karakteristik",
      "Mak",
      "Fonksyonalite"
    ],
    "given": [
      "* ",
      "Sipoze ",
      "Sipoze ke ",
      "Sipoze Ke "
    ],
    "name": "Creole",
    "native": "kreyÃ²l",
    "scenario": [
      "Senaryo"
    ],
    "scenarioOutline": [
      "Plan senaryo",
      "Plan Senaryo",
      "Senaryo deskripsyon",
      "Senaryo Deskripsyon",
      "Dyagram senaryo",
      "Dyagram Senaryo"
    ],
    "then": [
      "* ",
      "LÃ¨ sa a ",
      "Le sa a "
    ],
    "when": [
      "* ",
      "LÃ¨ ",
      "Le "
    ]
  },
  "hu": {
    "and": [
      "* ",
      "Ã‰s "
    ],
    "background": [
      "HÃ¡ttÃ©r"
    ],
    "but": [
      "* ",
      "De "
    ],
    "examples": [
      "PÃ©ldÃ¡k"
    ],
    "feature": [
      "JellemzÅ‘"
    ],
    "given": [
      "* ",
      "Amennyiben ",
      "Adott "
    ],
    "name": "Hungarian",
    "native": "magyar",
    "scenario": [
      "ForgatÃ³kÃ¶nyv"
    ],
    "scenarioOutline": [
      "ForgatÃ³kÃ¶nyv vÃ¡zlat"
    ],
    "then": [
      "* ",
      "Akkor "
    ],
    "when": [
      "* ",
      "Majd ",
      "Ha ",
      "Amikor "
    ]
  },
  "id": {
    "and": [
      "* ",
      "Dan "
    ],
    "background": [
      "Dasar"
    ],
    "but": [
      "* ",
      "Tapi "
    ],
    "examples": [
      "Contoh"
    ],
    "feature": [
      "Fitur"
    ],
    "given": [
      "* ",
      "Dengan "
    ],
    "name": "Indonesian",
    "native": "Bahasa Indonesia",
    "scenario": [
      "Skenario"
    ],
    "scenarioOutline": [
      "Skenario konsep"
    ],
    "then": [
      "* ",
      "Maka "
    ],
    "when": [
      "* ",
      "Ketika "
    ]
  },
  "is": {
    "and": [
      "* ",
      "Og "
    ],
    "background": [
      "Bakgrunnur"
    ],
    "but": [
      "* ",
      "En "
    ],
    "examples": [
      "DÃ¦mi",
      "AtburÃ°arÃ¡sir"
    ],
    "feature": [
      "Eiginleiki"
    ],
    "given": [
      "* ",
      "Ef "
    ],
    "name": "Icelandic",
    "native": "Ãslenska",
    "scenario": [
      "AtburÃ°arÃ¡s"
    ],
    "scenarioOutline": [
      "LÃ½sing AtburÃ°arÃ¡sar",
      "LÃ½sing DÃ¦ma"
    ],
    "then": [
      "* ",
      "ÃžÃ¡ "
    ],
    "when": [
      "* ",
      "Ãžegar "
    ]
  },
  "it": {
    "and": [
      "* ",
      "E "
    ],
    "background": [
      "Contesto"
    ],
    "but": [
      "* ",
      "Ma "
    ],
    "examples": [
      "Esempi"
    ],
    "feature": [
      "FunzionalitÃ "
    ],
    "given": [
      "* ",
      "Dato ",
      "Data ",
      "Dati ",
      "Date "
    ],
    "name": "Italian",
    "native": "italiano",
    "scenario": [
      "Scenario"
    ],
    "scenarioOutline": [
      "Schema dello scenario"
    ],
    "then": [
      "* ",
      "Allora "
    ],
    "when": [
      "* ",
      "Quando "
    ]
  },
  "ja": {
    "and": [
      "* ",
      "ã‹ã¤"
    ],
    "background": [
      "èƒŒæ™¯"
    ],
    "but": [
      "* ",
      "ã—ã‹ã—",
      "ä½†ã—",
      "ãŸã ã—"
    ],
    "examples": [
      "ä¾‹",
      "ã‚µãƒ³ãƒ—ãƒ«"
    ],
    "feature": [
      "ãƒ•ã‚£ãƒ¼ãƒãƒ£",
      "æ©Ÿèƒ½"
    ],
    "given": [
      "* ",
      "å‰æ"
    ],
    "name": "Japanese",
    "native": "æ—¥æœ¬èªž",
    "scenario": [
      "ã‚·ãƒŠãƒªã‚ª"
    ],
    "scenarioOutline": [
      "ã‚·ãƒŠãƒªã‚ªã‚¢ã‚¦ãƒˆãƒ©ã‚¤ãƒ³",
      "ã‚·ãƒŠãƒªã‚ªãƒ†ãƒ³ãƒ—ãƒ¬ãƒ¼ãƒˆ",
      "ãƒ†ãƒ³ãƒ—ãƒ¬",
      "ã‚·ãƒŠãƒªã‚ªãƒ†ãƒ³ãƒ—ãƒ¬"
    ],
    "then": [
      "* ",
      "ãªã‚‰ã°"
    ],
    "when": [
      "* ",
      "ã‚‚ã—"
    ]
  },
  "jv": {
    "and": [
      "* ",
      "Lan "
    ],
    "background": [
      "Dasar"
    ],
    "but": [
      "* ",
      "Tapi ",
      "Nanging ",
      "Ananging "
    ],
    "examples": [
      "Conto",
      "Contone"
    ],
    "feature": [
      "Fitur"
    ],
    "given": [
      "* ",
      "Nalika ",
      "Nalikaning "
    ],
    "name": "Javanese",
    "native": "Basa Jawa",
    "scenario": [
      "Skenario"
    ],
    "scenarioOutline": [
      "Konsep skenario"
    ],
    "then": [
      "* ",
      "Njuk ",
      "Banjur "
    ],
    "when": [
      "* ",
      "Manawa ",
      "Menawa "
    ]
  },
  "kn": {
    "and": [
      "* ",
      "à²®à²¤à³à²¤à³ "
    ],
    "background": [
      "à²¹à²¿à²¨à³à²¨à³†à²²à³†"
    ],
    "but": [
      "* ",
      "à²†à²¦à²°à³† "
    ],
    "examples": [
      "à²‰à²¦à²¾à²¹à²°à²£à³†à²—à²³à³"
    ],
    "feature": [
      "à²¹à³†à²šà³à²šà²³"
    ],
    "given": [
      "* ",
      "à²¨à²¿à³•à²¡à²¿à²¦ "
    ],
    "name": "Kannada",
    "native": "à²•à²¨à³à²¨à²¡",
    "scenario": [
      "à²•à²¥à²¾à²¸à²¾à²°à²¾à²‚à²¶"
    ],
    "scenarioOutline": [
      "à²µà²¿à²µà²°à²£à³†"
    ],
    "then": [
      "* ",
      "à²¨à²‚à²¤à²° "
    ],
    "when": [
      "* ",
      "à²¸à³à²¥à²¿à²¤à²¿à²¯à²¨à³à²¨à³ "
    ]
  },
  "ko": {
    "and": [
      "* ",
      "ê·¸ë¦¬ê³ "
    ],
    "background": [
      "ë°°ê²½"
    ],
    "but": [
      "* ",
      "í•˜ì§€ë§Œ",
      "ë‹¨"
    ],
    "examples": [
      "ì˜ˆ"
    ],
    "feature": [
      "ê¸°ëŠ¥"
    ],
    "given": [
      "* ",
      "ì¡°ê±´",
      "ë¨¼ì €"
    ],
    "name": "Korean",
    "native": "í•œêµ­ì–´",
    "scenario": [
      "ì‹œë‚˜ë¦¬ì˜¤"
    ],
    "scenarioOutline": [
      "ì‹œë‚˜ë¦¬ì˜¤ ê°œìš”"
    ],
    "then": [
      "* ",
      "ê·¸ëŸ¬ë©´"
    ],
    "when": [
      "* ",
      "ë§Œì¼",
      "ë§Œì•½"
    ]
  },
  "lt": {
    "and": [
      "* ",
      "Ir "
    ],
    "background": [
      "Kontekstas"
    ],
    "but": [
      "* ",
      "Bet "
    ],
    "examples": [
      "PavyzdÅ¾iai",
      "Scenarijai",
      "Variantai"
    ],
    "feature": [
      "SavybÄ—"
    ],
    "given": [
      "* ",
      "Duota "
    ],
    "name": "Lithuanian",
    "native": "lietuviÅ³ kalba",
    "scenario": [
      "Scenarijus"
    ],
    "scenarioOutline": [
      "Scenarijaus Å¡ablonas"
    ],
    "then": [
      "* ",
      "Tada "
    ],
    "when": [
      "* ",
      "Kai "
    ]
  },
  "lu": {
    "and": [
      "* ",
      "an ",
      "a "
    ],
    "background": [
      "Hannergrond"
    ],
    "but": [
      "* ",
      "awer ",
      "mÃ¤ "
    ],
    "examples": [
      "Beispiller"
    ],
    "feature": [
      "FunktionalitÃ©it"
    ],
    "given": [
      "* ",
      "ugeholl "
    ],
    "name": "Luxemburgish",
    "native": "LÃ«tzebuergesch",
    "scenario": [
      "Szenario"
    ],
    "scenarioOutline": [
      "Plang vum Szenario"
    ],
    "then": [
      "* ",
      "dann "
    ],
    "when": [
      "* ",
      "wann "
    ]
  },
  "lv": {
    "and": [
      "* ",
      "Un "
    ],
    "background": [
      "Konteksts",
      "SituÄcija"
    ],
    "but": [
      "* ",
      "Bet "
    ],
    "examples": [
      "PiemÄ“ri",
      "Paraugs"
    ],
    "feature": [
      "FunkcionalitÄte",
      "FÄ«Äa"
    ],
    "given": [
      "* ",
      "Kad "
    ],
    "name": "Latvian",
    "native": "latvieÅ¡u",
    "scenario": [
      "ScenÄrijs"
    ],
    "scenarioOutline": [
      "ScenÄrijs pÄ“c parauga"
    ],
    "then": [
      "* ",
      "Tad "
    ],
    "when": [
      "* ",
      "Ja "
    ]
  },
  "nl": {
    "and": [
      "* ",
      "En "
    ],
    "background": [
      "Achtergrond"
    ],
    "but": [
      "* ",
      "Maar "
    ],
    "examples": [
      "Voorbeelden"
    ],
    "feature": [
      "Functionaliteit"
    ],
    "given": [
      "* ",
      "Gegeven ",
      "Stel "
    ],
    "name": "Dutch",
    "native": "Nederlands",
    "scenario": [
      "Scenario"
    ],
    "scenarioOutline": [
      "Abstract Scenario"
    ],
    "then": [
      "* ",
      "Dan "
    ],
    "when": [
      "* ",
      "Als "
    ]
  },
  "no": {
    "and": [
      "* ",
      "Og "
    ],
    "background": [
      "Bakgrunn"
    ],
    "but": [
      "* ",
      "Men "
    ],
    "examples": [
      "Eksempler"
    ],
    "feature": [
      "Egenskap"
    ],
    "given": [
      "* ",
      "Gitt "
    ],
    "name": "Norwegian",
    "native": "norsk",
    "scenario": [
      "Scenario"
    ],
    "scenarioOutline": [
      "Scenariomal",
      "Abstrakt Scenario"
    ],
    "then": [
      "* ",
      "SÃ¥ "
    ],
    "when": [
      "* ",
      "NÃ¥r "
    ]
  },
  "pa": {
    "and": [
      "* ",
      "à¨…à¨¤à©‡ "
    ],
    "background": [
      "à¨ªà¨¿à¨›à©‹à¨•à©œ"
    ],
    "but": [
      "* ",
      "à¨ªà¨° "
    ],
    "examples": [
      "à¨‰à¨¦à¨¾à¨¹à¨°à¨¨à¨¾à¨‚"
    ],
    "feature": [
      "à¨–à¨¾à¨¸à©€à¨…à¨¤",
      "à¨®à©à¨¹à¨¾à¨‚à¨¦à¨°à¨¾",
      "à¨¨à¨•à¨¶ à¨¨à©à¨¹à¨¾à¨°"
    ],
    "given": [
      "* ",
      "à¨œà©‡à¨•à¨° ",
      "à¨œà¨¿à¨µà©‡à¨‚ à¨•à¨¿ "
    ],
    "name": "Panjabi",
    "native": "à¨ªà©°à¨œà¨¾à¨¬à©€",
    "scenario": [
      "à¨ªà¨Ÿà¨•à¨¥à¨¾"
    ],
    "scenarioOutline": [
      "à¨ªà¨Ÿà¨•à¨¥à¨¾ à¨¢à¨¾à¨‚à¨šà¨¾",
      "à¨ªà¨Ÿà¨•à¨¥à¨¾ à¨°à©‚à¨ª à¨°à©‡à¨–à¨¾"
    ],
    "then": [
      "* ",
      "à¨¤à¨¦ "
    ],
    "when": [
      "* ",
      "à¨œà¨¦à©‹à¨‚ "
    ]
  },
  "pl": {
    "and": [
      "* ",
      "Oraz ",
      "I "
    ],
    "background": [
      "ZaÅ‚oÅ¼enia"
    ],
    "but": [
      "* ",
      "Ale "
    ],
    "examples": [
      "PrzykÅ‚ady"
    ],
    "feature": [
      "WÅ‚aÅ›ciwoÅ›Ä‡",
      "Funkcja",
      "Aspekt",
      "Potrzeba biznesowa"
    ],
    "given": [
      "* ",
      "ZakÅ‚adajÄ…c ",
      "MajÄ…c ",
      "ZakÅ‚adajÄ…c, Å¼e "
    ],
    "name": "Polish",
    "native": "polski",
    "scenario": [
      "Scenariusz"
    ],
    "scenarioOutline": [
      "Szablon scenariusza"
    ],
    "then": [
      "* ",
      "Wtedy "
    ],
    "when": [
      "* ",
      "JeÅ¼eli ",
      "JeÅ›li ",
      "Gdy ",
      "Kiedy "
    ]
  },
  "pt": {
    "and": [
      "* ",
      "E "
    ],
    "background": [
      "Contexto",
      "CenÃ¡rio de Fundo",
      "Cenario de Fundo",
      "Fundo"
    ],
    "but": [
      "* ",
      "Mas "
    ],
    "examples": [
      "Exemplos",
      "CenÃ¡rios",
      "Cenarios"
    ],
    "feature": [
      "Funcionalidade",
      "CaracterÃ­stica",
      "Caracteristica"
    ],
    "given": [
      "* ",
      "Dado ",
      "Dada ",
      "Dados ",
      "Dadas "
    ],
    "name": "Portuguese",
    "native": "portuguÃªs",
    "scenario": [
      "CenÃ¡rio",
      "Cenario"
    ],
    "scenarioOutline": [
      "Esquema do CenÃ¡rio",
      "Esquema do Cenario",
      "DelineaÃ§Ã£o do CenÃ¡rio",
      "Delineacao do Cenario"
    ],
    "then": [
      "* ",
      "EntÃ£o ",
      "Entao "
    ],
    "when": [
      "* ",
      "Quando "
    ]
  },
  "ro": {
    "and": [
      "* ",
      "Si ",
      "È˜i ",
      "Åži "
    ],
    "background": [
      "Context"
    ],
    "but": [
      "* ",
      "Dar "
    ],
    "examples": [
      "Exemple"
    ],
    "feature": [
      "Functionalitate",
      "FuncÈ›ionalitate",
      "FuncÅ£ionalitate"
    ],
    "given": [
      "* ",
      "Date fiind ",
      "Dat fiind ",
      "Dati fiind ",
      "DaÈ›i fiind ",
      "DaÅ£i fiind "
    ],
    "name": "Romanian",
    "native": "romÃ¢nÄƒ",
    "scenario": [
      "Scenariu"
    ],
    "scenarioOutline": [
      "Structura scenariu",
      "StructurÄƒ scenariu"
    ],
    "then": [
      "* ",
      "Atunci "
    ],
    "when": [
      "* ",
      "Cand ",
      "CÃ¢nd "
    ]
  },
  "ru": {
    "and": [
      "* ",
      "Ð˜ ",
      "Ðš Ñ‚Ð¾Ð¼Ñƒ Ð¶Ðµ ",
      "Ð¢Ð°ÐºÐ¶Ðµ "
    ],
    "background": [
      "ÐŸÑ€ÐµÐ´Ñ‹ÑÑ‚Ð¾Ñ€Ð¸Ñ",
      "ÐšÐ¾Ð½Ñ‚ÐµÐºÑÑ‚"
    ],
    "but": [
      "* ",
      "ÐÐ¾ ",
      "Ð "
    ],
    "examples": [
      "ÐŸÑ€Ð¸Ð¼ÐµÑ€Ñ‹"
    ],
    "feature": [
      "Ð¤ÑƒÐ½ÐºÑ†Ð¸Ñ",
      "Ð¤ÑƒÐ½ÐºÑ†Ð¸Ð¾Ð½Ð°Ð»",
      "Ð¡Ð²Ð¾Ð¹ÑÑ‚Ð²Ð¾"
    ],
    "given": [
      "* ",
      "Ð”Ð¾Ð¿ÑƒÑÑ‚Ð¸Ð¼ ",
      "Ð”Ð°Ð½Ð¾ ",
      "ÐŸÑƒÑÑ‚ÑŒ "
    ],
    "name": "Russian",
    "native": "Ñ€ÑƒÑÑÐºÐ¸Ð¹",
    "scenario": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ð¹"
    ],
    "scenarioOutline": [
      "Ð¡Ñ‚Ñ€ÑƒÐºÑ‚ÑƒÑ€Ð° ÑÑ†ÐµÐ½Ð°Ñ€Ð¸Ñ"
    ],
    "then": [
      "* ",
      "Ð¢Ð¾ ",
      "Ð¢Ð¾Ð³Ð´Ð° "
    ],
    "when": [
      "* ",
      "Ð•ÑÐ»Ð¸ ",
      "ÐšÐ¾Ð³Ð´Ð° "
    ]
  },
  "sk": {
    "and": [
      "* ",
      "A ",
      "A tieÅ¾ ",
      "A taktieÅ¾ ",
      "A zÃ¡roveÅˆ "
    ],
    "background": [
      "Pozadie"
    ],
    "but": [
      "* ",
      "Ale "
    ],
    "examples": [
      "PrÃ­klady"
    ],
    "feature": [
      "PoÅ¾iadavka",
      "Funkcia",
      "VlastnosÅ¥"
    ],
    "given": [
      "* ",
      "PokiaÄ¾ ",
      "Za predpokladu "
    ],
    "name": "Slovak",
    "native": "Slovensky",
    "scenario": [
      "ScenÃ¡r"
    ],
    "scenarioOutline": [
      "NÃ¡Ärt ScenÃ¡ru",
      "NÃ¡Ärt ScenÃ¡ra",
      "Osnova ScenÃ¡ra"
    ],
    "then": [
      "* ",
      "Tak ",
      "Potom "
    ],
    "when": [
      "* ",
      "KeÄ ",
      "Ak "
    ]
  },
  "sl": {
    "and": [
      "In ",
      "Ter "
    ],
    "background": [
      "Kontekst",
      "Osnova",
      "Ozadje"
    ],
    "but": [
      "Toda ",
      "Ampak ",
      "Vendar "
    ],
    "examples": [
      "Primeri",
      "Scenariji"
    ],
    "feature": [
      "Funkcionalnost",
      "Funkcija",
      "MoÅ¾nosti",
      "Moznosti",
      "Lastnost",
      "ZnaÄilnost"
    ],
    "given": [
      "Dano ",
      "Podano ",
      "Zaradi ",
      "Privzeto "
    ],
    "name": "Slovenian",
    "native": "Slovenski",
    "scenario": [
      "Scenarij",
      "Primer"
    ],
    "scenarioOutline": [
      "Struktura scenarija",
      "Skica",
      "Koncept",
      "Oris scenarija",
      "Osnutek"
    ],
    "then": [
      "Nato ",
      "Potem ",
      "Takrat "
    ],
    "when": [
      "Ko ",
      "Ce ",
      "ÄŒe ",
      "Kadar "
    ]
  },
  "sr-Cyrl": {
    "and": [
      "* ",
      "Ð˜ "
    ],
    "background": [
      "ÐšÐ¾Ð½Ñ‚ÐµÐºÑÑ‚",
      "ÐžÑÐ½Ð¾Ð²Ð°",
      "ÐŸÐ¾Ð·Ð°Ð´Ð¸Ð½Ð°"
    ],
    "but": [
      "* ",
      "ÐÐ»Ð¸ "
    ],
    "examples": [
      "ÐŸÑ€Ð¸Ð¼ÐµÑ€Ð¸",
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ñ˜Ð¸"
    ],
    "feature": [
      "Ð¤ÑƒÐ½ÐºÑ†Ð¸Ð¾Ð½Ð°Ð»Ð½Ð¾ÑÑ‚",
      "ÐœÐ¾Ð³ÑƒÑ›Ð½Ð¾ÑÑ‚",
      "ÐžÑÐ¾Ð±Ð¸Ð½Ð°"
    ],
    "given": [
      "* ",
      "Ð—Ð° Ð´Ð°Ñ‚Ð¾ ",
      "Ð—Ð° Ð´Ð°Ñ‚Ðµ ",
      "Ð—Ð° Ð´Ð°Ñ‚Ð¸ "
    ],
    "name": "Serbian",
    "native": "Ð¡Ñ€Ð¿ÑÐºÐ¸",
    "scenario": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ð¾",
      "ÐŸÑ€Ð¸Ð¼ÐµÑ€"
    ],
    "scenarioOutline": [
      "Ð¡Ñ‚Ñ€ÑƒÐºÑ‚ÑƒÑ€Ð° ÑÑ†ÐµÐ½Ð°Ñ€Ð¸Ñ˜Ð°",
      "Ð¡ÐºÐ¸Ñ†Ð°",
      "ÐšÐ¾Ð½Ñ†ÐµÐ¿Ñ‚"
    ],
    "then": [
      "* ",
      "ÐžÐ½Ð´Ð° "
    ],
    "when": [
      "* ",
      "ÐšÐ°Ð´Ð° ",
      "ÐšÐ°Ð´ "
    ]
  },
  "sr-Latn": {
    "and": [
      "* ",
      "I "
    ],
    "background": [
      "Kontekst",
      "Osnova",
      "Pozadina"
    ],
    "but": [
      "* ",
      "Ali "
    ],
    "examples": [
      "Primeri",
      "Scenariji"
    ],
    "feature": [
      "Funkcionalnost",
      "MoguÄ‡nost",
      "Mogucnost",
      "Osobina"
    ],
    "given": [
      "* ",
      "Za dato ",
      "Za date ",
      "Za dati "
    ],
    "name": "Serbian (Latin)",
    "native": "Srpski (Latinica)",
    "scenario": [
      "Scenario",
      "Primer"
    ],
    "scenarioOutline": [
      "Struktura scenarija",
      "Skica",
      "Koncept"
    ],
    "then": [
      "* ",
      "Onda "
    ],
    "when": [
      "* ",
      "Kada ",
      "Kad "
    ]
  },
  "sv": {
    "and": [
      "* ",
      "Och "
    ],
    "background": [
      "Bakgrund"
    ],
    "but": [
      "* ",
      "Men "
    ],
    "examples": [
      "Exempel"
    ],
    "feature": [
      "Egenskap"
    ],
    "given": [
      "* ",
      "Givet "
    ],
    "name": "Swedish",
    "native": "Svenska",
    "scenario": [
      "Scenario"
    ],
    "scenarioOutline": [
      "Abstrakt Scenario",
      "Scenariomall"
    ],
    "then": [
      "* ",
      "SÃ¥ "
    ],
    "when": [
      "* ",
      "NÃ¤r "
    ]
  },
  "ta": {
    "and": [
      "* ",
      "à®®à¯‡à®²à¯à®®à¯  ",
      "à®®à®±à¯à®±à¯à®®à¯ "
    ],
    "background": [
      "à®ªà®¿à®©à¯à®©à®£à®¿"
    ],
    "but": [
      "* ",
      "à®†à®©à®¾à®²à¯  "
    ],
    "examples": [
      "à®Žà®Ÿà¯à®¤à¯à®¤à¯à®•à¯à®•à®¾à®Ÿà¯à®Ÿà¯à®•à®³à¯",
      "à®•à®¾à®Ÿà¯à®šà®¿à®•à®³à¯",
      " à®¨à®¿à®²à¯ˆà®®à¯ˆà®•à®³à®¿à®²à¯"
    ],
    "feature": [
      "à®…à®®à¯à®šà®®à¯",
      "à®µà®£à®¿à®• à®¤à¯‡à®µà¯ˆ",
      "à®¤à®¿à®±à®©à¯"
    ],
    "given": [
      "* ",
      "à®•à¯†à®¾à®Ÿà¯à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®Ÿ "
    ],
    "name": "Tamil",
    "native": "à®¤à®®à®¿à®´à¯",
    "scenario": [
      "à®•à®¾à®Ÿà¯à®šà®¿"
    ],
    "scenarioOutline": [
      "à®•à®¾à®Ÿà¯à®šà®¿ à®šà¯à®°à¯à®•à¯à®•à®®à¯",
      "à®•à®¾à®Ÿà¯à®šà®¿ à®µà®¾à®°à¯à®ªà¯à®ªà¯à®°à¯"
    ],
    "then": [
      "* ",
      "à®…à®ªà¯à®ªà¯†à®¾à®´à¯à®¤à¯ "
    ],
    "when": [
      "* ",
      "à®Žà®ªà¯à®ªà¯‡à®¾à®¤à¯ "
    ]
  },
  "th": {
    "and": [
      "* ",
      "à¹à¸¥à¸° "
    ],
    "background": [
      "à¹à¸™à¸§à¸„à¸´à¸”"
    ],
    "but": [
      "* ",
      "à¹à¸•à¹ˆ "
    ],
    "examples": [
      "à¸Šà¸¸à¸”à¸‚à¸­à¸‡à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡",
      "à¸Šà¸¸à¸”à¸‚à¸­à¸‡à¹€à¸«à¸•à¸¸à¸à¸²à¸£à¸“à¹Œ"
    ],
    "feature": [
      "à¹‚à¸„à¸£à¸‡à¸«à¸¥à¸±à¸",
      "à¸„à¸§à¸²à¸¡à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸—à¸²à¸‡à¸˜à¸¸à¸£à¸à¸´à¸ˆ",
      "à¸„à¸§à¸²à¸¡à¸ªà¸²à¸¡à¸²à¸£à¸–"
    ],
    "given": [
      "* ",
      "à¸à¸³à¸«à¸™à¸”à¹ƒà¸«à¹‰ "
    ],
    "name": "Thai",
    "native": "à¹„à¸—à¸¢",
    "scenario": [
      "à¹€à¸«à¸•à¸¸à¸à¸²à¸£à¸“à¹Œ"
    ],
    "scenarioOutline": [
      "à¸ªà¸£à¸¸à¸›à¹€à¸«à¸•à¸¸à¸à¸²à¸£à¸“à¹Œ",
      "à¹‚à¸„à¸£à¸‡à¸ªà¸£à¹‰à¸²à¸‡à¸‚à¸­à¸‡à¹€à¸«à¸•à¸¸à¸à¸²à¸£à¸“à¹Œ"
    ],
    "then": [
      "* ",
      "à¸”à¸±à¸‡à¸™à¸±à¹‰à¸™ "
    ],
    "when": [
      "* ",
      "à¹€à¸¡à¸·à¹ˆà¸­ "
    ]
  },
  "tl": {
    "and": [
      "* ",
      "à°®à°°à°¿à°¯à± "
    ],
    "background": [
      "à°¨à±‡à°ªà°¥à±à°¯à°‚"
    ],
    "but": [
      "* ",
      "à°•à°¾à°¨à°¿ "
    ],
    "examples": [
      "à°‰à°¦à°¾à°¹à°°à°£à°²à±"
    ],
    "feature": [
      "à°—à±à°£à°®à±"
    ],
    "given": [
      "* ",
      "à°šà±†à°ªà±à°ªà°¬à°¡à°¿à°¨à°¦à°¿ "
    ],
    "name": "Telugu",
    "native": "à°¤à±†à°²à±à°—à±",
    "scenario": [
      "à°¸à°¨à±à°¨à°¿à°µà±‡à°¶à°‚"
    ],
    "scenarioOutline": [
      "à°•à°¥à°¨à°‚"
    ],
    "then": [
      "* ",
      "à°…à°ªà±à°ªà±à°¡à± "
    ],
    "when": [
      "* ",
      "à°ˆ à°ªà°°à°¿à°¸à±à°¥à°¿à°¤à°¿à°²à±‹ "
    ]
  },
  "tlh": {
    "and": [
      "* ",
      "'ej ",
      "latlh "
    ],
    "background": [
      "mo'"
    ],
    "but": [
      "* ",
      "'ach ",
      "'a "
    ],
    "examples": [
      "ghantoH",
      "lutmey"
    ],
    "feature": [
      "Qap",
      "Qu'meH 'ut",
      "perbogh",
      "poQbogh malja'",
      "laH"
    ],
    "given": [
      "* ",
      "ghu' noblu' ",
      "DaH ghu' bejlu' "
    ],
    "name": "Klingon",
    "native": "tlhIngan",
    "scenario": [
      "lut"
    ],
    "scenarioOutline": [
      "lut chovnatlh"
    ],
    "then": [
      "* ",
      "vaj "
    ],
    "when": [
      "* ",
      "qaSDI' "
    ]
  },
  "tr": {
    "and": [
      "* ",
      "Ve "
    ],
    "background": [
      "GeÃ§miÅŸ"
    ],
    "but": [
      "* ",
      "Fakat ",
      "Ama "
    ],
    "examples": [
      "Ã–rnekler"
    ],
    "feature": [
      "Ã–zellik"
    ],
    "given": [
      "* ",
      "Diyelim ki "
    ],
    "name": "Turkish",
    "native": "TÃ¼rkÃ§e",
    "scenario": [
      "Senaryo"
    ],
    "scenarioOutline": [
      "Senaryo taslaÄŸÄ±"
    ],
    "then": [
      "* ",
      "O zaman "
    ],
    "when": [
      "* ",
      "EÄŸer ki "
    ]
  },
  "tt": {
    "and": [
      "* ",
      "ÒºÓ™Ð¼ ",
      "Ð’Ó™ "
    ],
    "background": [
      "ÐšÐµÑ€ÐµÑˆ"
    ],
    "but": [
      "* ",
      "Ð›Ó™ÐºÐ¸Ð½ ",
      "Ó˜Ð¼Ð¼Ð° "
    ],
    "examples": [
      "Ò®Ñ€Ð½Ó™ÐºÐ»Ó™Ñ€",
      "ÐœÐ¸ÑÐ°Ð»Ð»Ð°Ñ€"
    ],
    "feature": [
      "ÐœÓ©Ð¼ÐºÐ¸Ð½Ð»ÐµÐº",
      "Ò®Ð·ÐµÐ½Ñ‡Ó™Ð»ÐµÐºÐ»ÐµÐ»ÐµÐº"
    ],
    "given": [
      "* ",
      "Ó˜Ð¹Ñ‚Ð¸Ðº "
    ],
    "name": "Tatar",
    "native": "Ð¢Ð°Ñ‚Ð°Ñ€Ñ‡Ð°",
    "scenario": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ð¹"
    ],
    "scenarioOutline": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ð¹Ð½Ñ‹Ò£ Ñ‚Ó©Ð·ÐµÐ»ÐµÑˆÐµ"
    ],
    "then": [
      "* ",
      "ÐÓ™Ñ‚Ð¸Ò—Ó™Ð´Ó™ "
    ],
    "when": [
      "* ",
      "Ó˜Ð³Ó™Ñ€ "
    ]
  },
  "uk": {
    "and": [
      "* ",
      "Ð† ",
      "Ð Ñ‚Ð°ÐºÐ¾Ð¶ ",
      "Ð¢Ð° "
    ],
    "background": [
      "ÐŸÐµÑ€ÐµÐ´ÑƒÐ¼Ð¾Ð²Ð°"
    ],
    "but": [
      "* ",
      "ÐÐ»Ðµ "
    ],
    "examples": [
      "ÐŸÑ€Ð¸ÐºÐ»Ð°Ð´Ð¸"
    ],
    "feature": [
      "Ð¤ÑƒÐ½ÐºÑ†Ñ–Ð¾Ð½Ð°Ð»"
    ],
    "given": [
      "* ",
      "ÐŸÑ€Ð¸Ð¿ÑƒÑÑ‚Ð¸Ð¼Ð¾ ",
      "ÐŸÑ€Ð¸Ð¿ÑƒÑÑ‚Ð¸Ð¼Ð¾, Ñ‰Ð¾ ",
      "ÐÐµÑ…Ð°Ð¹ ",
      "Ð”Ð°Ð½Ð¾ "
    ],
    "name": "Ukrainian",
    "native": "Ð£ÐºÑ€Ð°Ñ—Ð½ÑÑŒÐºÐ°",
    "scenario": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ñ–Ð¹"
    ],
    "scenarioOutline": [
      "Ð¡Ñ‚Ñ€ÑƒÐºÑ‚ÑƒÑ€Ð° ÑÑ†ÐµÐ½Ð°Ñ€Ñ–ÑŽ"
    ],
    "then": [
      "* ",
      "Ð¢Ð¾ ",
      "Ð¢Ð¾Ð´Ñ– "
    ],
    "when": [
      "* ",
      "Ð¯ÐºÑ‰Ð¾ ",
      "ÐšÐ¾Ð»Ð¸ "
    ]
  },
  "ur": {
    "and": [
      "* ",
      "Ø§ÙˆØ± "
    ],
    "background": [
      "Ù¾Ø³ Ù…Ù†Ø¸Ø±"
    ],
    "but": [
      "* ",
      "Ù„ÛŒÚ©Ù† "
    ],
    "examples": [
      "Ù…Ø«Ø§Ù„ÛŒÚº"
    ],
    "feature": [
      "ØµÙ„Ø§Ø­ÛŒØª",
      "Ú©Ø§Ø±ÙˆØ¨Ø§Ø± Ú©ÛŒ Ø¶Ø±ÙˆØ±Øª",
      "Ø®ØµÙˆØµÛŒØª"
    ],
    "given": [
      "* ",
      "Ø§Ú¯Ø± ",
      "Ø¨Ø§Ù„ÙØ±Ø¶ ",
      "ÙØ±Ø¶ Ú©ÛŒØ§ "
    ],
    "name": "Urdu",
    "native": "Ø§Ø±Ø¯Ùˆ",
    "scenario": [
      "Ù…Ù†Ø¸Ø±Ù†Ø§Ù…Û"
    ],
    "scenarioOutline": [
      "Ù…Ù†Ø¸Ø± Ù†Ø§Ù…Û’ Ú©Ø§ Ø®Ø§Ú©Û"
    ],
    "then": [
      "* ",
      "Ù¾Ú¾Ø± ",
      "ØªØ¨ "
    ],
    "when": [
      "* ",
      "Ø¬Ø¨ "
    ]
  },
  "uz": {
    "and": [
      "* ",
      "Ð’Ð° "
    ],
    "background": [
      "Ð¢Ð°Ñ€Ð¸Ñ…"
    ],
    "but": [
      "* ",
      "Ð›ÐµÐºÐ¸Ð½ ",
      "Ð‘Ð¸Ñ€Ð¾Ðº ",
      "ÐÐ¼Ð¼Ð¾ "
    ],
    "examples": [
      "ÐœÐ¸ÑÐ¾Ð»Ð»Ð°Ñ€"
    ],
    "feature": [
      "Ð¤ÑƒÐ½ÐºÑ†Ð¸Ð¾Ð½Ð°Ð»"
    ],
    "given": [
      "* ",
      "ÐÐ³Ð°Ñ€ "
    ],
    "name": "Uzbek",
    "native": "Ð£Ð·Ð±ÐµÐºÑ‡Ð°",
    "scenario": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ð¹"
    ],
    "scenarioOutline": [
      "Ð¡Ñ†ÐµÐ½Ð°Ñ€Ð¸Ð¹ ÑÑ‚Ñ€ÑƒÐºÑ‚ÑƒÑ€Ð°ÑÐ¸"
    ],
    "then": [
      "* ",
      "Ð£Ð½Ð´Ð° "
    ],
    "when": [
      "* ",
      "ÐÐ³Ð°Ñ€ "
    ]
  },
  "vi": {
    "and": [
      "* ",
      "VÃ  "
    ],
    "background": [
      "Bá»‘i cáº£nh"
    ],
    "but": [
      "* ",
      "NhÆ°ng "
    ],
    "examples": [
      "Dá»¯ liá»‡u"
    ],
    "feature": [
      "TÃ­nh nÄƒng"
    ],
    "given": [
      "* ",
      "Biáº¿t ",
      "Cho "
    ],
    "name": "Vietnamese",
    "native": "Tiáº¿ng Viá»‡t",
    "scenario": [
      "TÃ¬nh huá»‘ng",
      "Ká»‹ch báº£n"
    ],
    "scenarioOutline": [
      "Khung tÃ¬nh huá»‘ng",
      "Khung ká»‹ch báº£n"
    ],
    "then": [
      "* ",
      "ThÃ¬ "
    ],
    "when": [
      "* ",
      "Khi "
    ]
  },
  "zh-CN": {
    "and": [
      "* ",
      "è€Œä¸”",
      "å¹¶ä¸”",
      "åŒæ—¶"
    ],
    "background": [
      "èƒŒæ™¯"
    ],
    "but": [
      "* ",
      "ä½†æ˜¯"
    ],
    "examples": [
      "ä¾‹å­"
    ],
    "feature": [
      "åŠŸèƒ½"
    ],
    "given": [
      "* ",
      "å‡å¦‚",
      "å‡è®¾",
      "å‡å®š"
    ],
    "name": "Chinese simplified",
    "native": "ç®€ä½“ä¸­æ–‡",
    "scenario": [
      "åœºæ™¯",
      "å‰§æœ¬"
    ],
    "scenarioOutline": [
      "åœºæ™¯å¤§çº²",
      "å‰§æœ¬å¤§çº²"
    ],
    "then": [
      "* ",
      "é‚£ä¹ˆ"
    ],
    "when": [
      "* ",
      "å½“"
    ]
  },
  "zh-TW": {
    "and": [
      "* ",
      "è€Œä¸”",
      "ä¸¦ä¸”",
      "åŒæ™‚"
    ],
    "background": [
      "èƒŒæ™¯"
    ],
    "but": [
      "* ",
      "ä½†æ˜¯"
    ],
    "examples": [
      "ä¾‹å­"
    ],
    "feature": [
      "åŠŸèƒ½"
    ],
    "given": [
      "* ",
      "å‡å¦‚",
      "å‡è¨­",
      "å‡å®š"
    ],
    "name": "Chinese traditional",
    "native": "ç¹é«”ä¸­æ–‡",
    "scenario": [
      "å ´æ™¯",
      "åŠ‡æœ¬"
    ],
    "scenarioOutline": [
      "å ´æ™¯å¤§ç¶±",
      "åŠ‡æœ¬å¤§ç¶±"
    ],
    "then": [
      "* ",
      "é‚£éº¼"
    ],
    "when": [
      "* ",
      "ç•¶"
    ]
  }
}

},{}],6:[function(require,module,exports){
function GherkinLine(lineText, lineNumber) {
  this.lineText = lineText;
  this.lineNumber = lineNumber;
  this.trimmedLineText = lineText.replace(/^\s+/g, ''); // ltrim
  this.isEmpty = this.trimmedLineText.length == 0;
  this.indent = lineText.length - this.trimmedLineText.length;
};

GherkinLine.prototype.startsWith = function startsWith(prefix) {
  return this.trimmedLineText.indexOf(prefix) == 0;
};

GherkinLine.prototype.startsWithTitleKeyword = function startsWithTitleKeyword(keyword) {
  return this.startsWith(keyword+':'); // The C# impl is more complicated. Find out why.
};

GherkinLine.prototype.getLineText = function getLineText(indentToRemove) {
  if (indentToRemove < 0 || indentToRemove > this.indent) {
    return this.trimmedLineText;
  } else {
    return this.lineText.substring(indentToRemove);
  }
};

GherkinLine.prototype.getRestTrimmed = function getRestTrimmed(length) {
  return this.trimmedLineText.substring(length).trim();
};

GherkinLine.prototype.getTableCells = function getTableCells() {
  var column = this.indent + 1;
  var items = this.trimmedLineText.split('|');
  items.shift(); // Skip the beginning of the line
  items.pop(); // Skip the one after the last pipe
  return items.map(function (item) {
    var cellIndent = item.length - item.replace(/^\s+/g, '').length + 1;
    var span = {column: column + cellIndent, text: item.trim()};
    column += item.length + 1;
    return span;
  });
};

GherkinLine.prototype.getTags = function getTags() {
  var column = this.indent + 1;
  var items = this.trimmedLineText.trim().split('@');
  items.shift();
  return items.map(function (item) {
    var length = item.length;
    var span = {column: column, text: '@' + item.trim()};
    column += length + 1;
    return span;
  });
};

module.exports = GherkinLine;

},{}],7:[function(require,module,exports){
// This file is generated. Do not edit! Edit gherkin-javascript.razor instead.
var Errors = require('./errors');

module.exports = function Parser(astBuilder) {

  var RULE_TYPES = [
    'None',
    '_EOF', // #EOF
    '_Empty', // #Empty
    '_Comment', // #Comment
    '_TagLine', // #TagLine
    '_FeatureLine', // #FeatureLine
    '_BackgroundLine', // #BackgroundLine
    '_ScenarioLine', // #ScenarioLine
    '_ScenarioOutlineLine', // #ScenarioOutlineLine
    '_ExamplesLine', // #ExamplesLine
    '_StepLine', // #StepLine
    '_DocStringSeparator', // #DocStringSeparator
    '_TableRow', // #TableRow
    '_Language', // #Language
    '_Other', // #Other
    'Feature', // Feature! := Feature_Header Background? Scenario_Definition*
    'Feature_Header', // Feature_Header! := #Language? Tags? #FeatureLine Feature_Description
    'Background', // Background! := #BackgroundLine Background_Description Scenario_Step*
    'Scenario_Definition', // Scenario_Definition! := Tags? (Scenario | ScenarioOutline)
    'Scenario', // Scenario! := #ScenarioLine Scenario_Description Scenario_Step*
    'ScenarioOutline', // ScenarioOutline! := #ScenarioOutlineLine ScenarioOutline_Description ScenarioOutline_Step* Examples_Definition+
    'Examples_Definition', // Examples_Definition! [#Empty|#Comment|#TagLine-&gt;#ExamplesLine] := Tags? Examples
    'Examples', // Examples! := #ExamplesLine Examples_Description #TableRow #TableRow+
    'Scenario_Step', // Scenario_Step := Step
    'ScenarioOutline_Step', // ScenarioOutline_Step := Step
    'Step', // Step! := #StepLine Step_Arg?
    'Step_Arg', // Step_Arg := (DataTable | DocString)
    'DataTable', // DataTable! := #TableRow+
    'DocString', // DocString! := #DocStringSeparator #Other* #DocStringSeparator
    'Tags', // Tags! := #TagLine+
    'Feature_Description', // Feature_Description := Description_Helper
    'Background_Description', // Background_Description := Description_Helper
    'Scenario_Description', // Scenario_Description := Description_Helper
    'ScenarioOutline_Description', // ScenarioOutline_Description := Description_Helper
    'Examples_Description', // Examples_Description := Description_Helper
    'Description_Helper', // Description_Helper := #Empty* Description? #Comment*
    'Description', // Description! := #Other+
  ]

  var astBuilder = astBuilder;
  var context = {};

  this.parse = function(tokenScanner, tokenMatcher) {
    astBuilder.reset();
    tokenMatcher.reset();
    context.tokenScanner = tokenScanner;
    context.tokenMatcher = tokenMatcher;
    context.tokenQueue = [];
    context.errors = [];

    startRule(context, 'Feature');
    var state = 0;
    var token = null;
    while(true) {
      token = readToken(context);
      state = matchToken(state, token, context);
      if(token.isEof) break;
    }

    endRule(context, 'Feature');

    if(context.errors.length > 0) {
      throw Errors.CompositeParserException.create(context.errors);
    }

    return getResult();
  };

  function addError(context, error) {
    context.errors.push(error);
    if (context.errors.length > 10)
      throw Errors.CompositeParserException.create(context.errors);
  }

  function startRule(context, ruleType) {
    handleAstError(context, function () {
      astBuilder.startRule(ruleType);
    });
  }

  function endRule(context, ruleType) {
    handleAstError(context, function () {
      astBuilder.endRule(ruleType);
    });
  }

  function build(context, token) {
    handleAstError(context, function () {
      astBuilder.build(token);
    });
  }

  function getResult() {
    return astBuilder.getResult();
  }

  function handleAstError(context, action) {
    handleExternalError(context, true, action)
  }

  function handleExternalError(context, defaultValue, action) {
    if(this.stopAtFirstError) return action();
    try {
      return action();
    } catch (e) {
      if(e instanceof Errors.CompositeParserException) {
        e.errors.forEach(function (error) {
          addError(context, error);
        });
      } else if(
        e instanceof Errors.ParserException ||
        e instanceof Errors.AstBuilderException ||
        e instanceof Errors.UnexpectedTokenException ||
        e instanceof Errors.NoSuchLanguageException
      ) {
        addError(context, e);
      } else {
        throw e;
      }
    }
    return defaultValue;
  }

  function readToken(context) {
    return context.tokenQueue.length > 0 ?
      context.tokenQueue.shift() :
      context.tokenScanner.read();
  }

  function matchToken(state, token, context) {
    switch(state) {
    case 0:
      return matchTokenAt_0(token, context);
    case 1:
      return matchTokenAt_1(token, context);
    case 2:
      return matchTokenAt_2(token, context);
    case 3:
      return matchTokenAt_3(token, context);
    case 4:
      return matchTokenAt_4(token, context);
    case 5:
      return matchTokenAt_5(token, context);
    case 6:
      return matchTokenAt_6(token, context);
    case 7:
      return matchTokenAt_7(token, context);
    case 8:
      return matchTokenAt_8(token, context);
    case 9:
      return matchTokenAt_9(token, context);
    case 10:
      return matchTokenAt_10(token, context);
    case 11:
      return matchTokenAt_11(token, context);
    case 12:
      return matchTokenAt_12(token, context);
    case 13:
      return matchTokenAt_13(token, context);
    case 14:
      return matchTokenAt_14(token, context);
    case 15:
      return matchTokenAt_15(token, context);
    case 16:
      return matchTokenAt_16(token, context);
    case 17:
      return matchTokenAt_17(token, context);
    case 18:
      return matchTokenAt_18(token, context);
    case 19:
      return matchTokenAt_19(token, context);
    case 20:
      return matchTokenAt_20(token, context);
    case 21:
      return matchTokenAt_21(token, context);
    case 22:
      return matchTokenAt_22(token, context);
    case 23:
      return matchTokenAt_23(token, context);
    case 24:
      return matchTokenAt_24(token, context);
    case 25:
      return matchTokenAt_25(token, context);
    case 26:
      return matchTokenAt_26(token, context);
    case 27:
      return matchTokenAt_27(token, context);
    case 29:
      return matchTokenAt_29(token, context);
    case 30:
      return matchTokenAt_30(token, context);
    case 31:
      return matchTokenAt_31(token, context);
    case 32:
      return matchTokenAt_32(token, context);
    case 33:
      return matchTokenAt_33(token, context);
    case 34:
      return matchTokenAt_34(token, context);
    default:
      throw new Error("Unknown state: " + state);
    }
  }


  // Start
  function matchTokenAt_0(token, context) {
    if(match_Language(context, token)) {
      startRule(context, 'Feature_Header');
      build(context, token);
      return 1;
    }
    if(match_TagLine(context, token)) {
      startRule(context, 'Feature_Header');
      startRule(context, 'Tags');
      build(context, token);
      return 2;
    }
    if(match_FeatureLine(context, token)) {
      startRule(context, 'Feature_Header');
      build(context, token);
      return 3;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 0;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 0;
    }
    
    var stateComment = "State: 0 - Start";
    token.detach();
    var expectedTokens = ["#Language", "#TagLine", "#FeatureLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 0;
  }


  // Feature:0>Feature_Header:0>#Language:0
  function matchTokenAt_1(token, context) {
    if(match_TagLine(context, token)) {
      startRule(context, 'Tags');
      build(context, token);
      return 2;
    }
    if(match_FeatureLine(context, token)) {
      build(context, token);
      return 3;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 1;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 1;
    }
    
    var stateComment = "State: 1 - Feature:0>Feature_Header:0>#Language:0";
    token.detach();
    var expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 1;
  }


  // Feature:0>Feature_Header:1>Tags:0>#TagLine:0
  function matchTokenAt_2(token, context) {
    if(match_TagLine(context, token)) {
      build(context, token);
      return 2;
    }
    if(match_FeatureLine(context, token)) {
      endRule(context, 'Tags');
      build(context, token);
      return 3;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 2;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 2;
    }
    
    var stateComment = "State: 2 - Feature:0>Feature_Header:1>Tags:0>#TagLine:0";
    token.detach();
    var expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 2;
  }


  // Feature:0>Feature_Header:2>#FeatureLine:0
  function matchTokenAt_3(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Feature_Header');
      build(context, token);
      return 28;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 3;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 5;
    }
    if(match_BackgroundLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Background');
      build(context, token);
      return 6;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Other(context, token)) {
      startRule(context, 'Description');
      build(context, token);
      return 4;
    }
    
    var stateComment = "State: 3 - Feature:0>Feature_Header:2>#FeatureLine:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Empty", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 3;
  }


  // Feature:0>Feature_Header:3>Feature_Description:0>Description_Helper:1>Description:0>#Other:0
  function matchTokenAt_4(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Feature_Header');
      build(context, token);
      return 28;
    }
    if(match_Comment(context, token)) {
      endRule(context, 'Description');
      build(context, token);
      return 5;
    }
    if(match_BackgroundLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Feature_Header');
      startRule(context, 'Background');
      build(context, token);
      return 6;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 4;
    }
    
    var stateComment = "State: 4 - Feature:0>Feature_Header:3>Feature_Description:0>Description_Helper:1>Description:0>#Other:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 4;
  }


  // Feature:0>Feature_Header:3>Feature_Description:0>Description_Helper:2>#Comment:0
  function matchTokenAt_5(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Feature_Header');
      build(context, token);
      return 28;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 5;
    }
    if(match_BackgroundLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Background');
      build(context, token);
      return 6;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Feature_Header');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 5;
    }
    
    var stateComment = "State: 5 - Feature:0>Feature_Header:3>Feature_Description:0>Description_Helper:2>#Comment:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 5;
  }


  // Feature:1>Background:0>#BackgroundLine:0
  function matchTokenAt_6(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Background');
      build(context, token);
      return 28;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 6;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 8;
    }
    if(match_StepLine(context, token)) {
      startRule(context, 'Step');
      build(context, token);
      return 9;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Other(context, token)) {
      startRule(context, 'Description');
      build(context, token);
      return 7;
    }
    
    var stateComment = "State: 6 - Feature:1>Background:0>#BackgroundLine:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 6;
  }


  // Feature:1>Background:1>Background_Description:0>Description_Helper:1>Description:0>#Other:0
  function matchTokenAt_7(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Background');
      build(context, token);
      return 28;
    }
    if(match_Comment(context, token)) {
      endRule(context, 'Description');
      build(context, token);
      return 8;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'Description');
      startRule(context, 'Step');
      build(context, token);
      return 9;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 7;
    }
    
    var stateComment = "State: 7 - Feature:1>Background:1>Background_Description:0>Description_Helper:1>Description:0>#Other:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 7;
  }


  // Feature:1>Background:1>Background_Description:0>Description_Helper:2>#Comment:0
  function matchTokenAt_8(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Background');
      build(context, token);
      return 28;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 8;
    }
    if(match_StepLine(context, token)) {
      startRule(context, 'Step');
      build(context, token);
      return 9;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 8;
    }
    
    var stateComment = "State: 8 - Feature:1>Background:1>Background_Description:0>Description_Helper:2>#Comment:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 8;
  }


  // Feature:1>Background:2>Scenario_Step:0>Step:0>#StepLine:0
  function matchTokenAt_9(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Background');
      build(context, token);
      return 28;
    }
    if(match_TableRow(context, token)) {
      startRule(context, 'DataTable');
      build(context, token);
      return 10;
    }
    if(match_DocStringSeparator(context, token)) {
      startRule(context, 'DocString');
      build(context, token);
      return 33;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 9;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 9;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 9;
    }
    
    var stateComment = "State: 9 - Feature:1>Background:2>Scenario_Step:0>Step:0>#StepLine:0";
    token.detach();
    var expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 9;
  }


  // Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0
  function matchTokenAt_10(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Background');
      build(context, token);
      return 28;
    }
    if(match_TableRow(context, token)) {
      build(context, token);
      return 10;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 9;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 10;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 10;
    }
    
    var stateComment = "State: 10 - Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0";
    token.detach();
    var expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 10;
  }


  // Feature:2>Scenario_Definition:0>Tags:0>#TagLine:0
  function matchTokenAt_11(token, context) {
    if(match_TagLine(context, token)) {
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Tags');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Tags');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 11;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 11;
    }
    
    var stateComment = "State: 11 - Feature:2>Scenario_Definition:0>Tags:0>#TagLine:0";
    token.detach();
    var expectedTokens = ["#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 11;
  }


  // Feature:2>Scenario_Definition:1>__alt0:0>Scenario:0>#ScenarioLine:0
  function matchTokenAt_12(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      build(context, token);
      return 28;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 12;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 14;
    }
    if(match_StepLine(context, token)) {
      startRule(context, 'Step');
      build(context, token);
      return 15;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Other(context, token)) {
      startRule(context, 'Description');
      build(context, token);
      return 13;
    }
    
    var stateComment = "State: 12 - Feature:2>Scenario_Definition:1>__alt0:0>Scenario:0>#ScenarioLine:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 12;
  }


  // Feature:2>Scenario_Definition:1>__alt0:0>Scenario:1>Scenario_Description:0>Description_Helper:1>Description:0>#Other:0
  function matchTokenAt_13(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      build(context, token);
      return 28;
    }
    if(match_Comment(context, token)) {
      endRule(context, 'Description');
      build(context, token);
      return 14;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'Description');
      startRule(context, 'Step');
      build(context, token);
      return 15;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Description');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 13;
    }
    
    var stateComment = "State: 13 - Feature:2>Scenario_Definition:1>__alt0:0>Scenario:1>Scenario_Description:0>Description_Helper:1>Description:0>#Other:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 13;
  }


  // Feature:2>Scenario_Definition:1>__alt0:0>Scenario:1>Scenario_Description:0>Description_Helper:2>#Comment:0
  function matchTokenAt_14(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      build(context, token);
      return 28;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 14;
    }
    if(match_StepLine(context, token)) {
      startRule(context, 'Step');
      build(context, token);
      return 15;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 14;
    }
    
    var stateComment = "State: 14 - Feature:2>Scenario_Definition:1>__alt0:0>Scenario:1>Scenario_Description:0>Description_Helper:2>#Comment:0";
    token.detach();
    var expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 14;
  }


  // Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:0>#StepLine:0
  function matchTokenAt_15(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      build(context, token);
      return 28;
    }
    if(match_TableRow(context, token)) {
      startRule(context, 'DataTable');
      build(context, token);
      return 16;
    }
    if(match_DocStringSeparator(context, token)) {
      startRule(context, 'DocString');
      build(context, token);
      return 31;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 15;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 15;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 15;
    }
    
    var stateComment = "State: 15 - Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:0>#StepLine:0";
    token.detach();
    var expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 15;
  }


  // Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0
  function matchTokenAt_16(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      build(context, token);
      return 28;
    }
    if(match_TableRow(context, token)) {
      build(context, token);
      return 16;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 15;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 16;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 16;
    }
    
    var stateComment = "State: 16 - Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0";
    token.detach();
    var expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 16;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:0>#ScenarioOutlineLine:0
  function matchTokenAt_17(token, context) {
    if(match_Empty(context, token)) {
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 19;
    }
    if(match_StepLine(context, token)) {
      startRule(context, 'Step');
      build(context, token);
      return 20;
    }
    if(match_TagLine(context, token)) {
      startRule(context, 'Examples_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 22;
    }
    if(match_ExamplesLine(context, token)) {
      startRule(context, 'Examples_Definition');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_Other(context, token)) {
      startRule(context, 'Description');
      build(context, token);
      return 18;
    }
    
    var stateComment = "State: 17 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:0>#ScenarioOutlineLine:0";
    token.detach();
    var expectedTokens = ["#Empty", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 17;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:1>ScenarioOutline_Description:0>Description_Helper:1>Description:0>#Other:0
  function matchTokenAt_18(token, context) {
    if(match_Comment(context, token)) {
      endRule(context, 'Description');
      build(context, token);
      return 19;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'Description');
      startRule(context, 'Step');
      build(context, token);
      return 20;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Description');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 22;
    }
    if(match_ExamplesLine(context, token)) {
      endRule(context, 'Description');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 18;
    }
    
    var stateComment = "State: 18 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:1>ScenarioOutline_Description:0>Description_Helper:1>Description:0>#Other:0";
    token.detach();
    var expectedTokens = ["#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 18;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:1>ScenarioOutline_Description:0>Description_Helper:2>#Comment:0
  function matchTokenAt_19(token, context) {
    if(match_Comment(context, token)) {
      build(context, token);
      return 19;
    }
    if(match_StepLine(context, token)) {
      startRule(context, 'Step');
      build(context, token);
      return 20;
    }
    if(match_TagLine(context, token)) {
      startRule(context, 'Examples_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 22;
    }
    if(match_ExamplesLine(context, token)) {
      startRule(context, 'Examples_Definition');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 19;
    }
    
    var stateComment = "State: 19 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:1>ScenarioOutline_Description:0>Description_Helper:2>#Comment:0";
    token.detach();
    var expectedTokens = ["#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 19;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:0>#StepLine:0
  function matchTokenAt_20(token, context) {
    if(match_TableRow(context, token)) {
      startRule(context, 'DataTable');
      build(context, token);
      return 21;
    }
    if(match_DocStringSeparator(context, token)) {
      startRule(context, 'DocString');
      build(context, token);
      return 29;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 20;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Step');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 22;
    }
    if(match_ExamplesLine(context, token)) {
      endRule(context, 'Step');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 20;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 20;
    }
    
    var stateComment = "State: 20 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:0>#StepLine:0";
    token.detach();
    var expectedTokens = ["#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 20;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0
  function matchTokenAt_21(token, context) {
    if(match_TableRow(context, token)) {
      build(context, token);
      return 21;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 20;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 22;
    }
    if(match_ExamplesLine(context, token)) {
      endRule(context, 'DataTable');
      endRule(context, 'Step');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 21;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 21;
    }
    
    var stateComment = "State: 21 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:0>DataTable:0>#TableRow:0";
    token.detach();
    var expectedTokens = ["#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 21;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:0>Tags:0>#TagLine:0
  function matchTokenAt_22(token, context) {
    if(match_TagLine(context, token)) {
      build(context, token);
      return 22;
    }
    if(match_ExamplesLine(context, token)) {
      endRule(context, 'Tags');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 22;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 22;
    }
    
    var stateComment = "State: 22 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:0>Tags:0>#TagLine:0";
    token.detach();
    var expectedTokens = ["#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 22;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:0>#ExamplesLine:0
  function matchTokenAt_23(token, context) {
    if(match_Empty(context, token)) {
      build(context, token);
      return 23;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 25;
    }
    if(match_TableRow(context, token)) {
      build(context, token);
      return 26;
    }
    if(match_Other(context, token)) {
      startRule(context, 'Description');
      build(context, token);
      return 24;
    }
    
    var stateComment = "State: 23 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:0>#ExamplesLine:0";
    token.detach();
    var expectedTokens = ["#Empty", "#Comment", "#TableRow", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 23;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:1>Examples_Description:0>Description_Helper:1>Description:0>#Other:0
  function matchTokenAt_24(token, context) {
    if(match_Comment(context, token)) {
      endRule(context, 'Description');
      build(context, token);
      return 25;
    }
    if(match_TableRow(context, token)) {
      endRule(context, 'Description');
      build(context, token);
      return 26;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 24;
    }
    
    var stateComment = "State: 24 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:1>Examples_Description:0>Description_Helper:1>Description:0>#Other:0";
    token.detach();
    var expectedTokens = ["#Comment", "#TableRow", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 24;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:1>Examples_Description:0>Description_Helper:2>#Comment:0
  function matchTokenAt_25(token, context) {
    if(match_Comment(context, token)) {
      build(context, token);
      return 25;
    }
    if(match_TableRow(context, token)) {
      build(context, token);
      return 26;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 25;
    }
    
    var stateComment = "State: 25 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:1>Examples_Description:0>Description_Helper:2>#Comment:0";
    token.detach();
    var expectedTokens = ["#Comment", "#TableRow", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 25;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:2>#TableRow:0
  function matchTokenAt_26(token, context) {
    if(match_TableRow(context, token)) {
      build(context, token);
      return 27;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 26;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 26;
    }
    
    var stateComment = "State: 26 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:2>#TableRow:0";
    token.detach();
    var expectedTokens = ["#TableRow", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 26;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:3>#TableRow:0
  function matchTokenAt_27(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'Examples');
      endRule(context, 'Examples_Definition');
      endRule(context, 'ScenarioOutline');
      endRule(context, 'Scenario_Definition');
      build(context, token);
      return 28;
    }
    if(match_TableRow(context, token)) {
      build(context, token);
      return 27;
    }
    if(match_TagLine(context, token)) {
      if(lookahead_0(context, token)) {
      endRule(context, 'Examples');
      endRule(context, 'Examples_Definition');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 22;
      }
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'Examples');
      endRule(context, 'Examples_Definition');
      endRule(context, 'ScenarioOutline');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ExamplesLine(context, token)) {
      endRule(context, 'Examples');
      endRule(context, 'Examples_Definition');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'Examples');
      endRule(context, 'Examples_Definition');
      endRule(context, 'ScenarioOutline');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'Examples');
      endRule(context, 'Examples_Definition');
      endRule(context, 'ScenarioOutline');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 27;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 27;
    }
    
    var stateComment = "State: 27 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:3>Examples_Definition:1>Examples:3>#TableRow:0";
    token.detach();
    var expectedTokens = ["#EOF", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 27;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0
  function matchTokenAt_29(token, context) {
    if(match_DocStringSeparator(context, token)) {
      build(context, token);
      return 30;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 29;
    }
    
    var stateComment = "State: 29 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0";
    token.detach();
    var expectedTokens = ["#DocStringSeparator", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 29;
  }


  // Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0
  function matchTokenAt_30(token, context) {
    if(match_StepLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 20;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 22;
    }
    if(match_ExamplesLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      startRule(context, 'Examples_Definition');
      startRule(context, 'Examples');
      build(context, token);
      return 23;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 30;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 30;
    }
    
    var stateComment = "State: 30 - Feature:2>Scenario_Definition:1>__alt0:1>ScenarioOutline:2>ScenarioOutline_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0";
    token.detach();
    var expectedTokens = ["#StepLine", "#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 30;
  }


  // Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0
  function matchTokenAt_31(token, context) {
    if(match_DocStringSeparator(context, token)) {
      build(context, token);
      return 32;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 31;
    }
    
    var stateComment = "State: 31 - Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0";
    token.detach();
    var expectedTokens = ["#DocStringSeparator", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 31;
  }


  // Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0
  function matchTokenAt_32(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      build(context, token);
      return 28;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 15;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Scenario');
      endRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 32;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 32;
    }
    
    var stateComment = "State: 32 - Feature:2>Scenario_Definition:1>__alt0:0>Scenario:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0";
    token.detach();
    var expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 32;
  }


  // Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0
  function matchTokenAt_33(token, context) {
    if(match_DocStringSeparator(context, token)) {
      build(context, token);
      return 34;
    }
    if(match_Other(context, token)) {
      build(context, token);
      return 33;
    }
    
    var stateComment = "State: 33 - Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:0>#DocStringSeparator:0";
    token.detach();
    var expectedTokens = ["#DocStringSeparator", "#Other"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 33;
  }


  // Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0
  function matchTokenAt_34(token, context) {
    if(match_EOF(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Background');
      build(context, token);
      return 28;
    }
    if(match_StepLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      startRule(context, 'Step');
      build(context, token);
      return 9;
    }
    if(match_TagLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Tags');
      build(context, token);
      return 11;
    }
    if(match_ScenarioLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'Scenario');
      build(context, token);
      return 12;
    }
    if(match_ScenarioOutlineLine(context, token)) {
      endRule(context, 'DocString');
      endRule(context, 'Step');
      endRule(context, 'Background');
      startRule(context, 'Scenario_Definition');
      startRule(context, 'ScenarioOutline');
      build(context, token);
      return 17;
    }
    if(match_Comment(context, token)) {
      build(context, token);
      return 34;
    }
    if(match_Empty(context, token)) {
      build(context, token);
      return 34;
    }
    
    var stateComment = "State: 34 - Feature:1>Background:2>Scenario_Step:0>Step:1>Step_Arg:0>__alt1:1>DocString:2>#DocStringSeparator:0";
    token.detach();
    var expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#ScenarioOutlineLine", "#Comment", "#Empty"];
    var error = token.isEof ?
      Errors.UnexpectedEOFException.create(token, expectedTokens, stateComment) :
      Errors.UnexpectedTokenException.create(token, expectedTokens, stateComment);
    if (this.stopAtFirstError) throw error;
    addError(context, error);
    return 34;
  }



  function match_EOF(context, token) {
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_EOF(token);
    });
  }


  function match_Empty(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_Empty(token);
    });
  }


  function match_Comment(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_Comment(token);
    });
  }


  function match_TagLine(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_TagLine(token);
    });
  }


  function match_FeatureLine(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_FeatureLine(token);
    });
  }


  function match_BackgroundLine(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_BackgroundLine(token);
    });
  }


  function match_ScenarioLine(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_ScenarioLine(token);
    });
  }


  function match_ScenarioOutlineLine(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_ScenarioOutlineLine(token);
    });
  }


  function match_ExamplesLine(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_ExamplesLine(token);
    });
  }


  function match_StepLine(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_StepLine(token);
    });
  }


  function match_DocStringSeparator(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_DocStringSeparator(token);
    });
  }


  function match_TableRow(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_TableRow(token);
    });
  }


  function match_Language(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_Language(token);
    });
  }


  function match_Other(context, token) {
    if(token.isEof) return false;
    return handleExternalError(context, false, function () {
      return context.tokenMatcher.match_Other(token);
    });
  }



  function lookahead_0(context, currentToken) {
    currentToken.detach();
    var token;
    var queue = [];
    var match = false;
    do {
      token = readToken(context);
      token.detach();
      queue.push(token);

      if (false  || match_ExamplesLine(context, token)) {
        match = true;
        break;
      }
    } while(false  || match_Empty(context, token) || match_Comment(context, token) || match_TagLine(context, token));

    context.tokenQueue = context.tokenQueue.concat(queue);

    return match;
  }


}

},{"./errors":4}],8:[function(require,module,exports){
function Token(line, location) {
  this.line = line;
  this.location = location;
  this.isEof = line == null;
};

Token.prototype.getTokenValue = function () {
  return this.isEof ? "EOF" : this.line.getLineText(-1);
};

Token.prototype.detach = function () {
  // TODO: Detach line, but is this really needed?
};

module.exports = Token;

},{}],9:[function(require,module,exports){
var dialects = require('./gherkin-languages.json');
var Errors = require('./errors');
var LANGUAGE_PATTERN = /^\s*#\s*language\s*:\s*([a-zA-Z\-_]+)\s*$/;

module.exports = function TokenMatcher(defaultDialectName) {
  defaultDialectName = defaultDialectName || 'en';

  var dialect;
  var dialectName;
  var activeDocStringSeparator;
  var indentToRemove;

  function changeDialect(newDialectName, location) {
    var newDialect = dialects[newDialectName];
    if(!newDialect) {
      throw Errors.NoSuchLanguageException.create(newDialectName, location);
    }

    dialectName = newDialectName;
    dialect = newDialect;
  }

  this.reset = function () {
    if(dialectName != defaultDialectName) changeDialect(defaultDialectName);
    activeDocStringSeparator = null;
    indentToRemove = 0;
  };

  this.reset();

  this.match_TagLine = function match_TagLine(token) {
    if(token.line.startsWith('@')) {
      setTokenMatched(token, 'TagLine', null, null, null, token.line.getTags());
      return true;
    }
    return false;
  };

  this.match_FeatureLine = function match_FeatureLine(token) {
    return matchTitleLine(token, 'FeatureLine', dialect.feature);
  };

  this.match_ScenarioLine = function match_ScenarioLine(token) {
    return matchTitleLine(token, 'ScenarioLine', dialect.scenario);
  };

  this.match_ScenarioOutlineLine = function match_ScenarioOutlineLine(token) {
    return matchTitleLine(token, 'ScenarioOutlineLine', dialect.scenarioOutline);
  };

  this.match_BackgroundLine = function match_BackgroundLine(token) {
    return matchTitleLine(token, 'BackgroundLine', dialect.background);
  };

  this.match_ExamplesLine = function match_ExamplesLine(token) {
    return matchTitleLine(token, 'ExamplesLine', dialect.examples);
  };

  this.match_TableRow = function match_TableRow(token) {
    if (token.line.startsWith('|')) {
      // TODO: indent
      setTokenMatched(token, 'TableRow', null, null, null, token.line.getTableCells());
      return true;
    }
    return false;
  };

  this.match_Empty = function match_Empty(token) {
    if (token.line.isEmpty) {
      setTokenMatched(token, 'Empty', null, null, 0);
      return true;
    }
    return false;
  };

  this.match_Comment = function match_Comment(token) {
    if(token.line.startsWith('#')) {
      var text = token.line.getLineText(0); //take the entire line, including leading space
      setTokenMatched(token, 'Comment', text, null, 0);
      return true;
    }
    return false;
  };

  this.match_Language = function match_Language(token) {
    var match;
    if(match = token.line.trimmedLineText.match(LANGUAGE_PATTERN)) {
      var newDialectName = match[1];
      setTokenMatched(token, 'Language', newDialectName);

      changeDialect(newDialectName, token.location);
      return true;
    }
    return false;
  };

  this.match_DocStringSeparator = function match_DocStringSeparator(token) {
    return activeDocStringSeparator == null
      ?
      // open
      _match_DocStringSeparator(token, '"""', true) ||
      _match_DocStringSeparator(token, '```', true)
      :
      // close
      _match_DocStringSeparator(token, activeDocStringSeparator, false);
  };

  function _match_DocStringSeparator(token, separator, isOpen) {
    if (token.line.startsWith(separator)) {
      var contentType = null;
      if (isOpen) {
        contentType = token.line.getRestTrimmed(separator.length);
        activeDocStringSeparator = separator;
        indentToRemove = token.line.indent;
      } else {
        activeDocStringSeparator = null;
        indentToRemove = 0;
      }

      // TODO: Use the separator as keyword. That's needed for pretty printing.
      setTokenMatched(token, 'DocStringSeparator', contentType);
      return true;
    }
    return false;
  }

  this.match_EOF = function match_EOF(token) {
    if(token.isEof) {
      setTokenMatched(token, 'EOF');
      return true;
    }
    return false;
  };

  this.match_StepLine = function match_StepLine(token) {
    var keywords = []
      .concat(dialect.given)
      .concat(dialect.when)
      .concat(dialect.then)
      .concat(dialect.and)
      .concat(dialect.but);
    var length = keywords.length;
    for(var i = 0, keyword; i < length; i++) {
      var keyword = keywords[i];

      if (token.line.startsWith(keyword)) {
        var title = token.line.getRestTrimmed(keyword.length);
        setTokenMatched(token, 'StepLine', title, keyword);
        return true;
      }
    }
    return false;
  };

  this.match_Other = function match_Other(token) {
    var text = token.line.getLineText(indentToRemove); //take the entire line, except removing DocString indents
    setTokenMatched(token, 'Other', unescapeDocString(text), null, 0);
    return true;
  };

  function matchTitleLine(token, tokenType, keywords) {
    var length = keywords.length;
    for(var i = 0, keyword; i < length; i++) {
      var keyword = keywords[i];

      if (token.line.startsWithTitleKeyword(keyword)) {
        var title = token.line.getRestTrimmed(keyword.length + ':'.length);
        setTokenMatched(token, tokenType, title, keyword);
        return true;
      }
    }
    return false;
  }

  function setTokenMatched(token, matchedType, text, keyword, indent, items) {
    token.matchedType = matchedType;
    token.matchedText = text;
    token.matchedKeyword = keyword;
    token.matchedIndent = (typeof indent === 'number') ? indent : (token.line == null ? 0 : token.line.indent);
    token.matchedItems = items || [];

    token.location.column = token.matchedIndent + 1;
    token.matchedGherkinDialect = dialectName;
  }

  function unescapeDocString(text) {
    return text.replace("\\\"\\\"\\\"", "\"\"\"");
  }
};

},{"./errors":4,"./gherkin-languages.json":5}],10:[function(require,module,exports){
var Token = require('./token');
var GherkinLine = require('./gherkin_line');

module.exports = function TokenScanner(source) {
  var lines = source.split(/\r?\n/);
  if(lines.length > 0 && lines[lines.length-1].trim() == '') {
    lines.pop();
  }
  var lineNumber = 0;

  this.read = function () {
    var line = lines[lineNumber++];
    var location = {line: lineNumber, column: 0};
    return line == null ? new Token(null, location) : new Token(new GherkinLine(line, lineNumber), location);
  }
};

},{"./gherkin_line":6,"./token":8}]},{},[1]);
