var BTCChina = require('btcchina');

var moment = require('moment');
var util = require('../util');
var _ = require('lodash');
var log = require('../log')

var Trader = function(config) {
  this.key = config.key;
  this.secret = config.secret;
  this.name = 'BTCChina';

  _.bindAll(this);

  this.btcchina = new BTCChina(this.key, this.secret);
}

Trader.prototype.buy = function(amount, price, callback) {
  // Prevent "You incorrectly entered one of fields."
  // because of more than 8 decimals.
  amount *= 100000000;
  amount = Math.floor(amount);
  amount /= 100000000;

  var set = function(err, data) {
    if(err)
      log.error('unable to buy:', err);

    callback(data.id);
  };

  // workaround for nonce error (copied from BTC-e code, not sure if needed)
  setTimeout(_.bind(function() {
    this.btcchina.buyOrder(price, amount, _.bind(set, this));
  }, this), 1000);
}

Trader.prototype.sell = function(amount, price, callback) {
  // Prevent "You incorrectly entered one of fields."
  // because of more than 8 decimals.
  amount *= 100000000;
  amount = Math.ceil(amount);
  amount /= 100000000;

  var set = function(err, data) {
    if(err)
      log.error('unable to sell:', err);

    callback(err, data.id);
  };

  // workaround for nonce error (copied from BTC-e code, not sure if needed)
  setTimeout(_.bind(function() {
    this.btcchina.sellOrder(price, amount, _.bind(set, this));
  }, this), 1000);
}

// if BTC-e errors we try the same call again after
// 5 seconds or half a second if there is haste
// also not sure if same applies to BTCChina - but better safe than sorry
Trader.prototype.retry = function(method, callback, haste) {
  var wait = +moment.duration(haste ? 0.5 : 5, 'seconds');
  log.debug(this.name , 'returned an error, retrying..');
  setTimeout(
    _.bind(method, this),
    wait,
    _.bind(callback, this)
  );
}

Trader.prototype.getPortfolio = function(callback) {
  var calculate = function(err, data) {
    if(err)
      return this.retry(this.btcchina.getAccountInfo, calculate);

    var portfolio = [];
    _.each(data.result.balance, function(assets, currency) {
      portfolio.push({name: currency.toUpperCase(), amount: assets.amount});
    });
    callback(err, portfolio);
  }
  this.btcchina.getAccountInfo(_.bind(calculate, this));
}

Trader.prototype.getTicker = function(callback) {
  // using getMarketDepth2 to get the highest bid and lowest ask
  var set = function(err, data) {
    var ticker = _.extend(data.ticker, {
      ask: data.result.market_depth.ask[0].price,
      bid: data.result.market_depth.bid[0].price
    });
    callback(err, ticker);
  }
  this.btcchina.getMarketDepth2(1, _.bind(set, this));
}

Trader.prototype.getFee = function(callback) {
  // Trades on BTCChina are free
  // BTCChina have only fee for withdrawals
  callback(false, 0);
}

Trader.prototype.checkOrder = function(order, callback) {
  var check = function(err, result) {
    // On error we assume that order does not exist
    // if order have open status it is not filled
    // on closed or cancelled status it is filled
    if(err)
      callback(err, true);
    else {
      if(result.result.order.status=='open') {
        callback(false, false);
      } else {
        callback(false, true);
      }
    }
  };

  this.btcchina.getOrder(order, _.bind(check, this));
}

Trader.prototype.cancelOrder = function(order) {
  var cancel = function(err, result) {
    if(err || result.result != true)
      log.error('unable to cancel order', order, '(', err, result, ')');
  };
  this.btcchina.cancelOrder(order, _.bind(cancel, this));
}

module.exports = Trader;

