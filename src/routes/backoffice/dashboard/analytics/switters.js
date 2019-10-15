const { RigorousRoute, authorizeClient } = require('$core/index');
const { RigorousError, errorsMessages } = require('$core/errors');

const HTTPHelper = require('$core/helpers/http');
const AnalyticsHelper = require('$core/helpers/analytics');

const authorizeWebsiteAccess = require('$middlewares/authorizeWebsiteAccess');
const populateBlacklistruleusers = require('$middlewares/populateBlacklistruleusers');

const {
  Website,
  Article,
  Swit
} = require('$models');


/**
 * Route settings
 */
const settingsRoute = {
  method: 'get', path: 'bo/dashboard/websites/:websiteId/analytics/switters'
};
const middlewares = [
  authorizeClient,
  authorizeWebsiteAccess,
  populateBlacklistruleusers
];

/**
 * Route
 */
class Route extends RigorousRoute {

  async secure(req) {

    this.timezone = HTTPHelper.parseTimezone(req);
    this.period = HTTPHelper.parsePeriod(req);

    this.website = await Website.findOne()
      .where('_id').equals(req.params.websiteId)
      .exec();

    if (this.website === null) {
      throw new RigorousError(errorsMessages.InexistentWebsiteError);
    }

    this.articles = await Article.distinct('_id')
      .where('website_id').equals(this.website)
      .exec();

    if (!this.articles.length) {
      throw new RigorousError(errorsMessages.NoArticlesToSellError);
    }

    this.blacklistedUsers = req.blacklistedUsersIds;
  }

  async process() {

    const dataset = await Swit.aggregate()
      .match({
        owner_id: { $nin: this.blacklistedUsers },
        article_id: { $in: this.articles },
        created_at: { $gte: this.period.startDate, $lte: this.period.endDate }
      })
      .group({
        _id: { $dateToString: { date: '$created_at', format: '%Y-%m-%d', timezone: this.timezone } },
        users: { $addToSet: '$owner_id' }
      })
      .sort({ _id: 'ascending' })
      .project({
        _id: 1,
        value: { $size: '$users' }
      })
      .project({ date: '$_id', value: 1, _id: 0 })
      .exec();

    const result = {
      dimension: 'date',
      metric: 'switters',
      metricUnit: 'switter',
      total: AnalyticsHelper.getTotal(dataset),
      dataset
    };

    return result;
  }
}

/**
 * Route export
 */
module.exports = new Route(settingsRoute.method, settingsRoute.path, middlewares);
