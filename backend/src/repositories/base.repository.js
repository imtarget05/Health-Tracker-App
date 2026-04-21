/**
 * Base Repository - Abstract class for all data repositories
 * Implements repository pattern for data access layer
 */
class BaseRepository {
    constructor(collection) {
        this.collection = collection;
    }

    /**
     * Find all documents
     */
    async findAll(filters = {}, options = {}) {
        const { limit = 100, offset = 0, sortBy = 'createdAt', order = 'desc' } = options;

        let query = this.collection;

        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                query = query.where(key, '==', value);
            }
        });

        // Apply sorting
        query = query.orderBy(sortBy, order);

        // Apply pagination
        query = query.offset(offset).limit(limit);

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }

    /**
     * Find document by ID
     */
    async findById(id) {
        const doc = await this.collection.doc(id).get();
        if (!doc.exists) {
            return null;
        }
        return {
            id: doc.id,
            ...doc.data(),
        };
    }

    /**
     * Find single document by filter
     */
    async findOne(filter) {
        const snapshot = await this.collection
            .where(Object.keys(filter)[0], '==', Object.values(filter)[0])
            .limit(1)
            .get();

        if (snapshot.empty) {
            return null;
        }

        const doc = snapshot.docs[0];
        return {
            id: doc.id,
            ...doc.data(),
        };
    }

    /**
     * Create new document
     */
    async create(data) {
        const docRef = await this.collection.add({
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        return {
            id: docRef.id,
            ...data,
        };
    }

    /**
     * Update document
     */
    async update(id, data) {
        await this.collection.doc(id).update({
            ...data,
            updatedAt: new Date().toISOString(),
        });

        return this.findById(id);
    }

    /**
     * Delete document
     */
    async delete(id) {
        await this.collection.doc(id).delete();
        return true;
    }

    /**
     * Count documents matching filters
     */
    async count(filters = {}) {
        let query = this.collection;

        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                query = query.where(key, '==', value);
            }
        });

        const snapshot = await query.get();
        return snapshot.size;
    }

    /**
     * Bulk create
     */
    async createMany(dataArray) {
        const batch = this.collection.firestore.batch();
        const results = [];

        dataArray.forEach(data => {
            const docRef = this.collection.doc();
            batch.set(docRef, {
                ...data,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            results.push({ id: docRef.id, ...data });
        });

        await batch.commit();
        return results;
    }

    /**
     * Bulk update
     */
    async updateMany(updates) {
        const batch = this.collection.firestore.batch();

        Object.entries(updates).forEach(([id, data]) => {
            batch.update(this.collection.doc(id), {
                ...data,
                updatedAt: new Date().toISOString(),
            });
        });

        await batch.commit();
        return true;
    }

    /**
     * Check if document exists
     */
    async exists(id) {
        const doc = await this.collection.doc(id).get();
        return doc.exists;
    }

    /**
     * Get sum of a field across documents
     */
    async getSum(field, filters = {}) {
        const docs = await this.findAll(filters, { limit: 1000 });
        return docs.reduce((sum, doc) => sum + (doc[field] || 0), 0);
    }

    /**
     * Get average of a field across documents
     */
    async getAverage(field, filters = {}) {
        const docs = await this.findAll(filters, { limit: 1000 });
        if (docs.length === 0) return 0;
        return docs.reduce((sum, doc) => sum + (doc[field] || 0), 0) / docs.length;
    }
}

module.exports = BaseRepository;
