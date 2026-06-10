import mqtt from 'mqtt';

export function startMqttClient(processReading) {
  const enabled = String(process.env.MQTT_ENABLE || 'false') === 'true';
  if (!enabled) {
    console.log('ℹ️ MQTT disabled. Set MQTT_ENABLE=true to connect HiveMQ Cloud.');
    return null;
  }

  const url = process.env.MQTT_URL;
  const topic = process.env.MQTT_TOPIC || 'elderly/monitoring/data';

  if (!url) {
    console.warn('⚠️ MQTT_URL belum diisi');
    return null;
  }

  const client = mqtt.connect(url, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 3000,
    connectTimeout: 30_000,
    clean: true,
    clientId: `backend-elderly-${Math.random().toString(16).slice(2)}`
  });

  client.on('connect', () => {
    console.log(`✅ MQTT connected: ${url}`);
    client.subscribe(topic, { qos: 0 }, (error) => {
      if (error) console.error('MQTT subscribe error:', error.message);
      else console.log(`📡 Subscribed to topic: ${topic}`);
    });
  });

  client.on('message', async (receivedTopic, payloadBuffer) => {
    try {
      const payload = JSON.parse(payloadBuffer.toString());
      await processReading(payload, `mqtt:${receivedTopic}`);
    } catch (error) {
      console.error('MQTT message error:', error.message);
    }
  });

  client.on('error', (error) => {
    console.error('MQTT error:', error.message);
  });

  client.on('reconnect', () => {
    console.log('🔄 MQTT reconnecting...');
  });

  return client;
}
