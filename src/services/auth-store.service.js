import prisma from "../lib/prisma.js";

async function usePostgresAuthState(channelId) {
  const { initAuthCreds, proto, delay } = await import("@whiskeysockets/baileys");

  // Helper to recursively restore Buffers from JSON-serialized objects {type: 'Buffer', data: [...]}
  const fixBuffer = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;

    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Buffer.from(obj.data);
    }

    if (Array.isArray(obj)) {
      return obj.map(fixBuffer);
    }

    const newObj = {};
    for (const key in obj) {
      newObj[key] = fixBuffer(obj[key]);
    }
    return newObj;
  };

  const readData = async (key) => {
    const session = await prisma.session.findUnique({
      where: { channel_id_key_id: { channel_id: channelId, key_id: key } },
    });
    if (!session) return null;
    try {
      const data = JSON.parse(session.data);
      return fixBuffer(data);
    } catch { return null; }
  };

  const writeData = async (key, data) => {
    const value = JSON.stringify(data);
    await prisma.session.upsert({
      where: { channel_id_key_id: { channel_id: channelId, key_id: key } },
      create: { channel_id: channelId, key_id: key, data: value },
      update: { data: value },
    });
  };

  const removeData = async (key) => {
    await prisma.session
      .delete({ where: { channel_id_key_id: { channel_id: channelId, key_id: key } } })
      .catch(() => {});
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let value = await readData(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) tasks.push(writeData(key, value));
              else tasks.push(removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => { await writeData("creds", creds); },
  };
}

export { usePostgresAuthState };
