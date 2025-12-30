import { table } from "@el3um4s/node-mdb";

const database = "../ShipData.mdb";

const result = await table.list({ database });
console.log(result);
//  ["Attività", "Users", "To Do"]

const schema = await table.schema({ database, table: "to do" });
console.log(schema);
// [
//   { DESC: "Integer", NAME: "ord", TYPE: "3" },
//   { DESC: "VarWChar", NAME: "to do", TYPE: "202" },
// ]