/**
 * Informix Database Connection Manager
 * Uses JDBC via Java subprocess for maximum compatibility
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const { config } = require('../config/database');

// Path to JDBC driver
const JDBC_JAR = process.env.INFORMIX_JDBC_JAR || path.join(__dirname, '../../lib/ifxjdbc.jar');

class InformixConnection {
  constructor() {
    this.isInitialized = false;
    this.jdbcUrl = null;
  }

  /**
   * Build JDBC connection URL
   */
  buildJdbcUrl() {
    const { host, port, database, server } = config;
    return `jdbc:informix-sqli://${host}:${port}/${database}:INFORMIXSERVER=${server}`;
  }

  /**
   * Initialize the connection
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('Connection already initialized');
      return;
    }

    try {
      this.jdbcUrl = this.buildJdbcUrl();

      // Verify Java is available
      try {
        execSync('java -version', { stdio: 'pipe' });
      } catch {
        throw new Error('Java is not installed or not in PATH');
      }

      // Test the connection
      await this.testConnection();

      this.isInitialized = true;
      console.log('Informix JDBC connection initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database connection:', error.message);
      throw error;
    }
  }

  /**
   * Test the database connection
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      await this.simpleQuery('SELECT FIRST 1 1 FROM systables');
      return true;
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Execute a query via Java JDBC
   * @param {string} sql - SQL query string
   * @param {Array} params - Query parameters (not used in this simple implementation)
   * @returns {Promise<Array>} Query results
   */
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      const javaCode = this.generateJavaQueryCode(sql, params);
      
      const java = spawn('java', [
        '-cp', JDBC_JAR,
        'InformixQuery',
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Send the Java code via stdin
      java.stdin.write(javaCode);
      java.stdin.end();

      let stdout = '';
      let stderr = '';

      java.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      java.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      java.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Query failed: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          const results = JSON.parse(stdout || '[]');
          resolve(results);
        } catch {
          resolve([]);
        }
      });

      java.on('error', (err) => {
        reject(new Error(`Failed to execute Java: ${err.message}`));
      });
    });
  }

  /**
   * Execute query using inline Java with jshell
   */
  async queryWithJshell(sql) {
    return new Promise((resolve, reject) => {
      const { user, password } = config;
      
      const script = `
        import java.sql.*;
        import java.util.*;
        
        try {
          Class.forName("com.informix.jdbc.IfxDriver");
          Connection conn = DriverManager.getConnection(
            "${this.jdbcUrl}",
            "${user}",
            "${password}"
          );
          Statement stmt = conn.createStatement();
          ResultSet rs = stmt.executeQuery("${sql.replace(/"/g, '\\"')}");
          ResultSetMetaData meta = rs.getMetaData();
          int cols = meta.getColumnCount();
          StringBuilder sb = new StringBuilder("[");
          boolean first = true;
          while (rs.next()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("{");
            for (int i = 1; i <= cols; i++) {
              if (i > 1) sb.append(",");
              String name = meta.getColumnName(i);
              String val = rs.getString(i);
              sb.append("\\"").append(name).append("\\":\\"").append(val != null ? val : "").append("\\"");
            }
            sb.append("}");
          }
          sb.append("]");
          System.out.println(sb.toString());
          rs.close();
          stmt.close();
          conn.close();
        } catch (Exception e) {
          System.err.println(e.getMessage());
          System.exit(1);
        }
        /exit
      `;

      const jshell = spawn('jshell', ['--class-path', JDBC_JAR], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      jshell.stdin.write(script);
      jshell.stdin.end();

      let stdout = '';
      let stderr = '';

      jshell.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      jshell.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      jshell.on('close', (code) => {
        // Extract JSON from jshell output
        const jsonMatch = stdout.match(/\[.*\]/s);
        if (jsonMatch) {
          try {
            resolve(JSON.parse(jsonMatch[0]));
          } catch {
            reject(new Error('Failed to parse results'));
          }
        } else if (code !== 0) {
          reject(new Error(stderr || 'Query failed'));
        } else {
          resolve([]);
        }
      });
    });
  }

  /**
   * Simple query execution - creates a temp Java file and runs it
   */
  async simpleQuery(sql) {
    const fs = require('fs');
    const os = require('os');
    const { user, password } = config;
    
    const tempDir = os.tmpdir();
    const javaFile = path.join(tempDir, 'InformixQuery.java');
    const escapedSql = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    const javaCode = `
import java.sql.*;

public class InformixQuery {
    public static void main(String[] args) {
        try {
            Class.forName("com.informix.jdbc.IfxDriver");
            Connection conn = DriverManager.getConnection(
                "${this.jdbcUrl}",
                "${user}",
                "${password}"
            );
            Statement stmt = conn.createStatement();
            ResultSet rs = stmt.executeQuery("${escapedSql}");
            ResultSetMetaData meta = rs.getMetaData();
            int cols = meta.getColumnCount();
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            while (rs.next()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("{");
                for (int i = 1; i <= cols; i++) {
                    if (i > 1) sb.append(",");
                    String name = meta.getColumnName(i);
                    String val = rs.getString(i);
                    sb.append("\\"").append(name).append("\\":");
                    if (val == null) {
                        sb.append("null");
                    } else {
                        sb.append("\\"").append(val.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"")).append("\\"");
                    }
                }
                sb.append("}");
            }
            sb.append("]");
            System.out.println(sb.toString());
            rs.close();
            stmt.close();
            conn.close();
        } catch (Exception e) {
            System.err.println("ERROR: " + e.getMessage());
            System.exit(1);
        }
    }
}
`;
    
    fs.writeFileSync(javaFile, javaCode);
    
    return new Promise((resolve, reject) => {
      // Compile
      const compile = spawn('javac', ['-cp', JDBC_JAR, javaFile], {
        cwd: tempDir,
      });
      
      let compileErr = '';
      compile.stderr.on('data', (d) => compileErr += d);
      
      compile.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Compilation failed: ${compileErr}`));
          return;
        }
        
        // Run
        const run = spawn('java', ['-cp', `${JDBC_JAR}${path.delimiter}${tempDir}`, 'InformixQuery']);
        
        let stdout = '';
        let stderr = '';
        
        run.stdout.on('data', (d) => stdout += d);
        run.stderr.on('data', (d) => stderr += d);
        
        run.on('close', (code) => {
          // Cleanup
          try {
            fs.unlinkSync(javaFile);
            fs.unlinkSync(path.join(tempDir, 'InformixQuery.class'));
          } catch {}
          
          if (code !== 0 || stderr.includes('ERROR:')) {
            reject(new Error(stderr || 'Query failed'));
            return;
          }
          
          try {
            resolve(JSON.parse(stdout.trim() || '[]'));
          } catch {
            reject(new Error('Failed to parse results'));
          }
        });
      });
    });
  }

  /**
   * Execute a query and return a single row
   */
  async queryOne(sql, params = []) {
    const results = await this.simpleQuery(sql);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE statement
   */
  async execute(sql, params = []) {
    const fs = require('fs');
    const os = require('os');
    const { user, password } = config;
    
    const tempDir = os.tmpdir();
    const javaFile = path.join(tempDir, 'InformixExecute.java');
    const escapedSql = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    const javaCode = `
import java.sql.*;

public class InformixExecute {
    public static void main(String[] args) {
        try {
            Class.forName("com.informix.jdbc.IfxDriver");
            Connection conn = DriverManager.getConnection(
                "${this.jdbcUrl}",
                "${user}",
                "${password}"
            );
            Statement stmt = conn.createStatement();
            int rowsAffected = stmt.executeUpdate("${escapedSql}");
            System.out.println("{\\"rowsAffected\\":" + rowsAffected + ",\\"success\\":true}");
            stmt.close();
            conn.close();
        } catch (Exception e) {
            System.err.println("ERROR: " + e.getMessage());
            System.exit(1);
        }
    }
}
`;
    
    fs.writeFileSync(javaFile, javaCode);
    
    return new Promise((resolve, reject) => {
      // Compile
      const compile = spawn('javac', ['-cp', JDBC_JAR, javaFile], {
        cwd: tempDir,
      });
      
      let compileErr = '';
      compile.stderr.on('data', (d) => compileErr += d);
      
      compile.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Compilation failed: ${compileErr}`));
          return;
        }
        
        // Run
        const run = spawn('java', ['-cp', `${JDBC_JAR}${path.delimiter}${tempDir}`, 'InformixExecute']);
        
        let stdout = '';
        let stderr = '';
        
        run.stdout.on('data', (d) => stdout += d);
        run.stderr.on('data', (d) => stderr += d);
        
        run.on('close', (code) => {
          // Cleanup
          try {
            fs.unlinkSync(javaFile);
            fs.unlinkSync(path.join(tempDir, 'InformixExecute.class'));
          } catch {}
          
          if (code !== 0 || stderr.includes('ERROR:')) {
            reject(new Error(stderr || 'Execute failed'));
            return;
          }
          
          try {
            resolve(JSON.parse(stdout.trim() || '{"rowsAffected":0,"success":true}'));
          } catch {
            resolve({ rowsAffected: 0, success: true });
          }
        });
      });
    });
  }

  generateJavaQueryCode(sql, params) {
    // This would generate inline Java for the query
    return '';
  }

  /**
   * Close connection (no-op for JDBC subprocess approach)
   */
  async close() {
    this.isInitialized = false;
    console.log('Connection closed');
  }
}

// Export singleton instance
const db = new InformixConnection();

module.exports = db;
