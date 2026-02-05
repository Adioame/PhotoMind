export class SmartAlbumService {
    constructor(database, searchService) {
        this.database = database;
        this.searchService = searchService;
    }
    async getSmartAlbums() {
        const albums = [];
        const places = await this.database.getAllPlaces();
        if (places.length > 0) {
            albums.push({
                id: 'smart-places',
                name: '按地点浏览',
                type: 'place',
                photoCount: places.reduce((sum, p) => sum + (p.photo_count || 0), 0)
            });
        }
        const people = await this.database.getAllPersons();
        if (people.length > 0) {
            albums.push({
                id: 'smart-people',
                name: '按人物浏览',
                type: 'people',
                photoCount: people.reduce((sum, p) => sum + (p.face_count || 0), 0)
            });
        }
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear - 2, currentYear - 3];
        for (const year of years) {
            const photos = await this.database.getPhotosByYear(year);
            albums.push({
                id: `smart-year-${year}`,
                name: `${year}年`,
                type: 'year',
                photoCount: photos.length,
                queryParams: { year }
            });
        }
        const tags = await this.database.getAllTags();
        if (tags.length > 0) {
            const topTags = tags.slice(0, 6);
            for (const tag of topTags) {
                const photos = await this.database.getPhotosByTag(tag.id);
                if (photos.length > 0) {
                    albums.push({
                        id: `smart-tag-${tag.id}`,
                        name: tag.name,
                        type: 'tag',
                        photoCount: photos.length,
                        queryParams: { tagId: tag.id }
                    });
                }
            }
        }
        const customAlbums = await this.database.getAllAlbums();
        for (const album of customAlbums) {
            albums.push({
                id: album.id,
                name: album.name,
                type: 'custom',
                photoCount: 0,
                queryParams: album.query_params
            });
        }
        return albums;
    }
    async getPlaceAlbums() {
        const places = await this.database.getAllPlaces();
        return places.map((place, index) => ({
            id: `place-${index}`,
            name: place.place_name,
            type: 'place',
            photoCount: place.photo_count,
            queryParams: { location: place.place_name }
        }));
    }
    async getPeopleAlbums() {
        const people = await this.database.getAllPersons();
        return people.map((person) => ({
            id: person.id,
            name: person.display_name || person.name,
            type: 'people',
            photoCount: person.face_count,
            queryParams: { personId: person.id, personName: person.name }
        }));
    }
    async getYearAlbums() {
        const yearCounts = await this.database.getPhotoCountByYear();
        const currentYear = new Date().getFullYear();
        const years = new Set([...yearCounts.map((y) => parseInt(y.year)), currentYear, currentYear - 1]);
        const albums = [];
        for (const year of years) {
            const count = yearCounts.find((y) => parseInt(y.year) === year)?.count || 0;
            albums.push({
                id: `year-${year}`,
                name: `${year}年`,
                type: 'year',
                photoCount: count,
                queryParams: { year }
            });
        }
        return albums.sort((a, b) => parseInt(b.name) - parseInt(a.name));
    }
    async getAlbumPhotos(album) {
        switch (album.type) {
            case 'place':
                if (album.queryParams?.location) {
                    return this.database.searchPhotos('', {
                        location: { keywords: [album.queryParams.location] }
                    });
                }
                break;
            case 'people':
                if (album.queryParams?.personId) {
                    return this.database.getPhotosByPerson(album.queryParams.personId);
                }
                break;
            case 'year':
                if (album.queryParams?.year) {
                    return this.database.getPhotosByYear(album.queryParams.year);
                }
                break;
            case 'tag':
                if (album.queryParams?.tagId) {
                    return this.database.getPhotosByTag(album.queryParams.tagId);
                }
                break;
            case 'custom':
                if (album.queryParams) {
                    return this.database.searchPhotos('', album.queryParams);
                }
                break;
        }
        return [];
    }
    async createAlbum(name, queryParams) {
        return this.database.addAlbum({
            name,
            type: 'custom',
            queryParams
        });
    }
    async deleteAlbum(id) {
        return this.database.deleteAlbum(id);
    }
    async getRecommendedAlbums() {
        const albums = [];
        const places = await this.database.getAllPlaces();
        if (places.length > 0) {
            albums.push({
                id: 'recent-places',
                name: '最近地点',
                type: 'place',
                photoCount: places.slice(0, 3).reduce((sum, p) => sum + (p.photo_count || 0), 0)
            });
        }
        const currentYear = new Date().getFullYear();
        const fiveYearsAgo = currentYear - 5;
        const oldPhotos = await this.database.getPhotosByYear(fiveYearsAgo);
        if (oldPhotos.length > 0) {
            albums.push({
                id: 'memories',
                name: '美好回忆',
                type: 'time',
                photoCount: oldPhotos.length,
                queryParams: { year: fiveYearsAgo }
            });
        }
        const people = await this.database.getAllPersons();
        if (people.length > 0) {
            albums.push({
                id: 'family',
                name: '家人',
                type: 'people',
                photoCount: people.reduce((sum, p) => sum + (p.face_count || 0), 0)
            });
        }
        const travelKeywords = ['旅行', '旅游', 'trip', 'travel'];
        for (const keyword of travelKeywords) {
            const photos = await this.database.searchPhotos('', {
                tags: [keyword]
            });
            if (photos.length > 0) {
                albums.push({
                    id: `travel-${keyword}`,
                    name: '旅行',
                    type: 'tag',
                    photoCount: photos.length
                });
                break;
            }
        }
        return albums;
    }
}
export const smartAlbumService = (database, searchService) => new SmartAlbumService(database, searchService);
//# sourceMappingURL=smartAlbumService.js.map