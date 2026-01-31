import cds from '@sap/cds';

export default cds.service.impl(function () {
  this.on('READ', 'Health', async (req) => {
    const db = cds.db;
    const model = cds.model;
    const counts = [];
    let seeded = false;

    // Alle persistente Entities durchlaufen
    for (const [name, entity] of Object.entries(model.entities)) {
      if (entity['@cds.persistence.skip']) continue;          // Health & Co. überspringen
      if (name.endsWith('.texts')) continue;                  // Texte optional überspringen
      try {
        // generisches COUNT(*)
        const result = await db.run(
          `SELECT COUNT(*) as ROWS FROM "${entity.name}"`
        );
        const rows = result[0]?.ROWS || 0;
        counts.push({ entity: entity.name, rows });
        if (rows > 0) seeded = true;
      } catch (e) {
        // z.B. Views ohne physische Tabelle ignorieren
      }
    }

    return [{
      profile: cds.env.profile || 'default',
      dbKind : cds.requires.db?.kind || 'sqlite',
      dbUrl  : cds.requires.db?.credentials?.url || 'local',
      seeded,
      counts
    }];
  });
});
