module.exports = function(config) {
  require('./karma.conf')(config);
  config.set({
    exclude: ['tests/**/*.only.feature']
  });
}
