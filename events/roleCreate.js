const config = require('../config.json');

module.exports = {
    name: 'roleCreate',
    async execute(role, client, db, saveDB) {
        if (!config.protectionSettings.roleProtection) return;

        try {
            // إضافة الرول الجديد للنسخة الاحتياطية
            const roleExists = db.backup.roles.find(r => r.id === role.id);
            
            if (!roleExists) {
                db.backup.roles.push({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    permissions: role.permissions.bitfield.toString(),
                    position: role.position,
                    hoist: role.hoist,
                    mentionable: role.mentionable
                });
                
                saveDB();
                console.log(`✅ تم إضافة رول جديد للنسخة الاحتياطية: ${role.name}`);
            }
        } catch (error) {
            console.error('خطأ في إضافة الرول للنسخة الاحتياطية:', error);
        }
    }
};
