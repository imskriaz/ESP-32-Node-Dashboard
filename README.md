# ESP32-S3 Manager Dashboard

Complete IoT management dashboard for Waveshare ESP32-S3 A7670E 4G board with Robi SIM.

## Features

### ✅ Completed
- **SMS Management**: Send/receive SMS via Robi SIM, real-time updates via MQTT
- **Call Management**: Call logs, dialer, contact integration
- **Contact Management**: CRUD operations, favorites, search
- **USSD Services**: Quick codes, history, custom service configuration
- **Modem Control**: Mobile data, WiFi client, hotspot sharing
- **Webcam**: Live MJPEG stream, capture, gallery
- **Storage Manager**: File browser for SD card (via MQTT)
- **Settings**: MQTT configuration, system settings, backup/restore
- **Authentication**: Login system with session management

### 🚧 In Progress
- **GPS Module**: Location tracking, history, maps integration
- **GPIO Control**: Pin mode configuration, read/write operations

## Hardware Requirements

- Waveshare ESP32-S3 A7670E 4G Development Board
- Robi 4G SIM card (APN: internet or internet.robiconnect.com)
- Optional: Camera module, MicroSD card, GPS antenna

## Pin Configuration

| Function | GPIO Pin |
|----------|----------|
| Modem TX | GPIO17 |
| Modem RX | GPIO18 |
| Camera   | Default ESP32-CAM pins |
| SD Card  | Default SPI pins |

## DIP Switch Settings

- **USB OFF**: ESP32 controls modem via UART
- **4G ON**: Enable 4G modem

## Server Setup

### Prerequisites
- Node.js 14+
- MQTT Broker (Mosquitto)
- SQLite3

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/esp32-s3-manager.git
cd esp32-s3-manager

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Initialize database
npm run init-db

# Start server
npm start


Environment Variables
env
# Server
PORT=3001
NODE_ENV=production
SESSION_SECRET=your-secret-key

# MQTT
MQTT_HOST=your-mqtt-broker.com
MQTT_PORT=1883
MQTT_USER=deviceuser
MQTT_PASSWORD=your-password

# Admin user
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this

MQTT Topics
Commands (Publish)
device/{id}/command/send-sms - Send SMS

device/{id}/command/make-call - Make call

device/{id}/command/send-ussd - Send USSD

device/{id}/command/capture - Capture image

device/{id}/command/gpio-write - Set GPIO pin

Status (Subscribe)
device/{id}/status - Device status updates

device/{id}/heartbeat - Heartbeat messages

device/{id}/sms/incoming - Incoming SMS

device/{id}/ussd/response - USSD responses

device/{id}/webcam/image - Captured images

device/{id}/gps/location - GPS coordinates

Arduino Code Example
cpp
#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// TinyGSM for A7670E
TinyGsm modem(Serial2);
TinyGsmClient client(modem);
PubSubClient mqtt(client);

void setup() {
    Serial.begin(115200);
    
    // Initialize modem
    Serial2.begin(115200, SERIAL_8N1, 18, 17); // RX=18, TX=17
    
    // Restart modem
    modem.restart();
    
    // Connect to network
    if (!modem.waitForNetwork()) {
        Serial.println("Network failed");
        return;
    }
    
    // Connect to MQTT
    mqtt.setServer("device.atebd.com", 1883);
    mqtt.setCallback(mqttCallback);
    mqttConnect();
}

void loop() {
    if (!mqtt.connected()) {
        mqttConnect();
    }
    mqtt.loop();
    
    // Check for incoming SMS
    if (modem.hasSMS()) {
        handleIncomingSMS();
    }
}
API Endpoints
SMS
GET /api/sms - List SMS

POST /api/sms/send - Send SMS

DELETE /api/sms/:id - Delete SMS

PUT /api/sms/:id/read - Mark as read

Calls
GET /api/calls/logs - Call history

POST /api/calls/dial - Make call

POST /api/calls/end - End call

DELETE /api/calls/logs/:id - Delete log

Contacts
GET /api/contacts - List contacts

POST /api/contacts - Create contact

PUT /api/contacts/:id - Update contact

DELETE /api/contacts/:id - Delete contact

Modem
GET /api/modem/status - Modem status

POST /api/modem/mobile/toggle - Toggle mobile data

GET /api/modem/wifi/client/scan - Scan WiFi

POST /api/modem/wifi/client/connect - Connect to WiFi

USSD
GET /api/ussd/history - USSD history

POST /api/ussd/send - Send USSD

GET /api/ussd/settings - USSD service settings

Webcam
GET /api/webcam/status - Camera status

POST /api/webcam/capture - Capture image

GET /api/webcam/stream - MJPEG stream

POST /api/webcam/settings - Update settings

Storage
GET /api/storage/info - SD card info

GET /api/storage/list - List files

POST /api/storage/upload - Upload file

DELETE /api/storage/delete - Delete file

WebSocket Events
Client → Server
get:status - Request server status

get:mqtt-status - Request MQTT status

get:device-status - Request device status

get:devices - List all devices

Server → Client
connected - Connection confirmation

mqtt:status - MQTT connection status

device:status - Device status update

device:heartbeat - Device heartbeat

sms:received - New SMS received

ussd:response - USSD response received

webcam:capture - New image captured

Development
bash
# Development mode with auto-reload
npm run dev

# Run database migrations
npm run init-db

# Check server health
curl http://localhost:3001/health
Directory Structure
text
esp32-s3-manager/
├── config/          # Database configuration
├── middleware/      # Auth middleware
├── public/          # Static files (JS, CSS, uploads)
├── routes/          # API routes
├── services/        # MQTT, modem services
├── utils/           # Logger, helpers
├── views/           # EJS templates
│   ├── layouts/     # Main layout
│   ├── pages/       # Page templates
│   └── partials/    # Reusable components
├── .env             # Environment variables
├── server.js        # Main entry point
└── package.json     # Dependencies
Troubleshooting
Modem not responding
Check DIP switches: USB OFF, 4G ON

Verify UART pins: RX=18, TX=17

Check SIM card insertion

No SMS received
Verify +CNMI=2,2 command sent

Check MQTT connection

Monitor Serial output for modem responses

MQTT connection failed
Verify broker address: device.atebd.com:1883

Check credentials in .env

Ensure port 1883 is open

License
MIT

Author
Your Name

Acknowledgments
Waveshare for ESP32-S3 A7670E board

TinyGSM library for SIMCom modem support

Bootstrap for UI components