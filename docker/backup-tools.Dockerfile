FROM ubuntu:22.04

ARG MONGODB_DATABASE_TOOLS_VERSION=100.20.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl --fail --silent --show-error --location \
      "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-${MONGODB_DATABASE_TOOLS_VERSION}.deb" \
      --output /tmp/mongodb-database-tools.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/mongodb-database-tools.deb \
    && mongodump --version \
    && mongorestore --version \
    && rm -f /tmp/mongodb-database-tools.deb \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /backup
