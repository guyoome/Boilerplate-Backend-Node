const { RigorousRoute, authorizeClient } = require('$core/index');
const { CustomError, errorsMessages } = require('$core/errors');

const HTTPHelper = require('$core/helpers/http');

const authorizeWebsiteAccess = require('$middlewares/authorizeWebsiteAccess');
const populateBlacklistruleusers = require('$middlewares/populateBlacklistruleusers');

const {
    Website,
    Article,
    VoteSwit,
    Swit
} = require('$models');

/**
 * Route settings
 */
const settingsRoute = {
    method: 'get', path: 'bo/dashboard/websites/:websiteId/rankings/competing-brands'
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
            throw new CustomError(errorsMessages.InexistentWebsiteError);
        }

        this.articles = await Article.distinct('_id')
            .where('website_id').equals(this.website)
            .exec();

        if (!this.articles.length) {
            throw new CustomError(errorsMessages.NoArticlesToSellError);
        }

        this.blacklistedUsers = req.blacklistedUsersIds;
    }

    async process() {

        const swits = await Swit.distinct('_id')
            .where('owner_id').nin(this.blacklistedUsers)
            .where('article_id').in(this.articles)
            .exec();

        const votes = await VoteSwit.distinct('vote_id')
            .where('swit_id').in(swits)
            .exec();

        const votesSwits = await VoteSwit.distinct('swit_id')
            .where('vote_id').in(votes)
            .exec();

        // Removes client swits from votes swits
        for (let i = 0; i < swits.length; i++) {
            for (let j = 0; j < votesSwits.length; j++) {
                if (votesSwits[i] && swits[i].toString() === votesSwits[j].toString()) {
                    votesSwits.splice(j, 1);
                }
            }
        }

        const ranking = await Swit.aggregate()
            .match({ _id: { $in: votesSwits } })
            .lookup({
                from: 'articles',
                localField: 'article_id',
                foreignField: '_id',
                as: 'article'
            })
            .unwind('article')
            .lookup({
                from: 'brands',
                localField: 'article.articlebrand_id',
                foreignField: '_id',
                as: 'brand'
            })
            .unwind('brand')
            .sortByCount('$brand.name')
            .limit(3)
            .exec();

        const result = {
            ranking
        };

        return result;
    }
}

/**
 * Route export
 */
module.exports = new Route(settingsRoute.method, settingsRoute.path, middlewares);
