# 📐 System Architecture Specification: OmniCache-Engine v2.0.0
- **Project:** OmniCache-Engine
- **Author:** Expert Software Architect
- **Status:** APPROVED & IN PRODUCTION
- **Version:** 2.0.0

## 1. High-Level Component Topology

```mermaid
flowchart TD
    Client["🌐 Client Applications / Microservices"] -->|HTTP REST / JSON| Server["⚡ HTTP API Entrypoint (src/index.js)"]
    Server --> Engine["🧠 OmniCacheEngine Core (src/engine.js)"]
    
    subgraph DataStructures["O(1) Data Structure Kernels"]
        direction LR
        HashMap["Hash Map (Key -> Node Pointer)"]
        DLL["Doubly-Linked List (MRU Head <---> LRU Tail)"]
    end
    
    Engine --> HashMap
    Engine --> DLL
    
    subgraph Policies["Memory & Expiration Policies"]
        direction TB
        TTL["TTL Expiration (Lazy + Sweep)"]
        ByteEstimator["Byte-Level Heap Memory Estimator"]
        Persistence["Disk Snapshot Engine (JSON Serialization)"]
    end
    
    Engine --> Policies
```

## 2. Doubly-Linked List Pointer Reassignment

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as HTTP Server (src/index.js)
    participant Core as OmniCacheEngine (src/engine.js)
    participant DLL as Doubly-Linked List

    Client->>API: GET /api/cache/:key
    API->>Core: get(key)
    Core->>Core: Lookup node in Map
    alt Key Found & Not Expired
        Core->>DLL: _detach(node)
        Core->>DLL: _attachHead(node)
        Core-->>API: Value (Cache HIT)
    else Key Expired or Absent
        opt Key Expired
            Core->>DLL: _detach(node)
            Core->>Core: map.delete(key)
        end
        Core-->>API: null (Cache MISS)
    end
    API-->>Client: 200 OK (X-Cache-Status Header)
```
