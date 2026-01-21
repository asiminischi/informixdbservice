FROM node:18-bullseye

WORKDIR /app

# Install Java JDK for JDBC driver (needs javac for compilation)
RUN apt-get update && apt-get install -y \
    default-jdk \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download IBM Informix JDBC driver
RUN mkdir -p /opt/informix/jdbc \
    && curl -L "https://repo1.maven.org/maven2/com/ibm/informix/jdbc/4.50.10/jdbc-4.50.10.jar" \
       -o /opt/informix/jdbc/ifxjdbc.jar

ENV INFORMIX_JDBC_JAR=/opt/informix/jdbc/ifxjdbc.jar

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Run the server
CMD ["node", "src/server.js"]
