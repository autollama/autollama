/**
 * SQL Query Builder
 * 🦙 Build safe, parameterized queries for both PostgreSQL and SQLite
 */

class QueryBuilder {
  constructor(databaseType = 'postgresql') {
    this.databaseType = databaseType;
    this.paramIndex = 0;
    this.params = [];
  }

  /**
   * Reset builder state
   */
  reset() {
    this.paramIndex = 0;
    this.params = [];
  }

  /**
   * Get placeholder for parameterized queries
   */
  getPlaceholder() {
    if (this.databaseType === 'postgresql') {
      return `$${++this.paramIndex}`;
    } else {
      this.paramIndex++;
      return '?';
    }
  }

  /**
   * Build INSERT query
   */
  insert(table, data) {
    this.reset();
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => this.getPlaceholder());
    
    let sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    
    // Add RETURNING clause for PostgreSQL
    if (this.databaseType === 'postgresql') {
      sql += ' RETURNING id';
    }
    
    this.params = values;
    
    return { sql, params: this.params };
  }

  /**
   * Build UPDATE query
   */
  update(table, data, where) {
    this.reset();
    
    const sets = [];
    const values = [];
    
    // Build SET clause
    for (const [column, value] of Object.entries(data)) {
      sets.push(`${column} = ${this.getPlaceholder()}`);
      values.push(value);
    }
    
    let sql = `UPDATE ${table} SET ${sets.join(', ')}`;
    
    // Add WHERE clause
    const whereClause = this.buildWhereClause(where, values);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    
    this.params = values;
    
    return { sql, params: this.params };
  }

  /**
   * Build DELETE query
   */
  delete(table, where) {
    this.reset();
    
    let sql = `DELETE FROM ${table}`;
    const values = [];
    
    // Add WHERE clause
    const whereClause = this.buildWhereClause(where, values);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    
    this.params = values;
    
    return { sql, params: this.params };
  }

  /**
   * Build SELECT query
   */
  select(table, options = {}) {
    this.reset();
    
    const {
      columns = ['*'],
      where = {},
      joins = [],
      orderBy = [],
      groupBy = [],
      having = {},
      limit,
      offset,
      distinct = false
    } = options;
    
    const values = [];
    
    // Build SELECT clause
    let sql = `SELECT ${distinct ? 'DISTINCT ' : ''}${columns.join(', ')} FROM ${table}`;
    
    // Add JOINs
    for (const join of joins) {
      const { type = 'INNER', table: joinTable, on } = join;
      sql += ` ${type} JOIN ${joinTable} ON ${on}`;
    }
    
    // Add WHERE clause
    const whereClause = this.buildWhereClause(where, values);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    
    // Add GROUP BY
    if (groupBy.length > 0) {
      sql += ` GROUP BY ${groupBy.join(', ')}`;
      
      // Add HAVING clause
      const havingClause = this.buildWhereClause(having, values);
      if (havingClause) {
        sql += ` HAVING ${havingClause}`;
      }
    }
    
    // Add ORDER BY
    if (orderBy.length > 0) {
      const orderClauses = orderBy.map(order => {
        if (typeof order === 'string') {
          return order;
        }
        return `${order.column} ${order.direction || 'ASC'}`;
      });
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }
    
    // Add LIMIT and OFFSET
    if (limit !== undefined) {
      sql += ` LIMIT ${limit}`;
    }
    
    if (offset !== undefined) {
      sql += ` OFFSET ${offset}`;
    }
    
    this.params = values;
    
    return { sql, params: this.params };
  }

  /**
   * Build COUNT query
   */
  count(table, where = {}) {
    this.reset();
    
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    const values = [];
    
    const whereClause = this.buildWhereClause(where, values);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    
    this.params = values;
    
    return { sql, params: this.params };
  }

  /**
   * Build WHERE clause from conditions object
   */
  buildWhereClause(conditions, values) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return '';
    }

    const clauses = [];
    
    for (const [field, condition] of Object.entries(conditions)) {
      if (condition === null) {
        clauses.push(`${field} IS NULL`);
      } else if (condition === undefined) {
        // Skip undefined values
        continue;
      } else if (typeof condition === 'object' && !Array.isArray(condition)) {
        // Handle operators
        for (const [operator, value] of Object.entries(condition)) {
          clauses.push(this.buildOperatorClause(field, operator, value, values));
        }
      } else if (Array.isArray(condition)) {
        // Handle IN operator
        if (condition.length > 0) {
          const placeholders = condition.map(() => {
            values.push(condition.shift());
            return this.getPlaceholder();
          });
          clauses.push(`${field} IN (${placeholders.join(', ')})`);
        }
      } else {
        // Simple equality
        values.push(condition);
        clauses.push(`${field} = ${this.getPlaceholder()}`);
      }
    }
    
    return clauses.join(' AND ');
  }

  /**
   * Build operator clause
   */
  buildOperatorClause(field, operator, value, values) {
    const upperOp = operator.toUpperCase();
    
    switch (upperOp) {
      case '$GT':
      case '>':
        values.push(value);
        return `${field} > ${this.getPlaceholder()}`;
      
      case '$GTE':
      case '>=':
        values.push(value);
        return `${field} >= ${this.getPlaceholder()}`;
      
      case '$LT':
      case '<':
        values.push(value);
        return `${field} < ${this.getPlaceholder()}`;
      
      case '$LTE':
      case '<=':
        values.push(value);
        return `${field} <= ${this.getPlaceholder()}`;
      
      case '$NE':
      case '!=':
      case '<>':
        values.push(value);
        return `${field} != ${this.getPlaceholder()}`;
      
      case '$LIKE':
      case 'LIKE':
        values.push(value);
        return `${field} LIKE ${this.getPlaceholder()}`;
      
      case '$ILIKE':
      case 'ILIKE':
        if (this.databaseType === 'postgresql') {
          values.push(value);
          return `${field} ILIKE ${this.getPlaceholder()}`;
        } else {
          // SQLite doesn't have ILIKE, use LIKE with LOWER
          values.push(value.toLowerCase());
          return `LOWER(${field}) LIKE LOWER(${this.getPlaceholder()})`;
        }
      
      case '$IN':
      case 'IN':
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(v => {
            values.push(v);
            return this.getPlaceholder();
          });
          return `${field} IN (${placeholders.join(', ')})`;
        }
        return '1=0'; // Always false if empty array
      
      case '$NOT_IN':
      case 'NOT IN':
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(v => {
            values.push(v);
            return this.getPlaceholder();
          });
          return `${field} NOT IN (${placeholders.join(', ')})`;
        }
        return '1=1'; // Always true if empty array
      
      case '$BETWEEN':
      case 'BETWEEN':
        if (Array.isArray(value) && value.length === 2) {
          values.push(value[0], value[1]);
          return `${field} BETWEEN ${this.getPlaceholder()} AND ${this.getPlaceholder()}`;
        }
        throw new Error('BETWEEN requires an array of two values');
      
      case '$IS_NULL':
      case 'IS NULL':
        return value ? `${field} IS NULL` : `${field} IS NOT NULL`;
      
      case '$IS_NOT_NULL':
      case 'IS NOT NULL':
        return value ? `${field} IS NOT NULL` : `${field} IS NULL`;
      
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Build a raw query with named parameters
   */
  raw(sql, namedParams = {}) {
    this.reset();
    
    let processedSql = sql;
    const values = [];
    
    // Replace named parameters with placeholders
    for (const [name, value] of Object.entries(namedParams)) {
      const regex = new RegExp(`:${name}\\b`, 'g');
      processedSql = processedSql.replace(regex, () => {
        values.push(value);
        return this.getPlaceholder();
      });
    }
    
    this.params = values;
    
    return { sql: processedSql, params: this.params };
  }

  /**
   * Build UPSERT query (INSERT ... ON CONFLICT)
   */
  upsert(table, data, conflictColumns) {
    if (this.databaseType === 'postgresql') {
      return this.postgresqlUpsert(table, data, conflictColumns);
    } else {
      return this.sqliteUpsert(table, data, conflictColumns);
    }
  }

  /**
   * PostgreSQL UPSERT
   */
  postgresqlUpsert(table, data, conflictColumns) {
    this.reset();
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => this.getPlaceholder());
    
    let sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    sql += ` ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET `;
    
    const updates = columns
      .filter(col => !conflictColumns.includes(col))
      .map(col => `${col} = EXCLUDED.${col}`);
    
    sql += updates.join(', ');
    sql += ' RETURNING id';
    
    this.params = values;
    
    return { sql, params: this.params };
  }

  /**
   * SQLite UPSERT
   */
  sqliteUpsert(table, data, conflictColumns) {
    this.reset();
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => this.getPlaceholder());
    
    let sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    
    this.params = values;
    
    return { sql, params: this.params };
  }

  /**
   * Build batch insert query
   */
  batchInsert(table, rows) {
    if (rows.length === 0) {
      throw new Error('Cannot batch insert empty rows');
    }
    
    this.reset();
    
    const columns = Object.keys(rows[0]);
    const valueRows = [];
    const values = [];
    
    for (const row of rows) {
      const rowPlaceholders = columns.map(col => {
        values.push(row[col]);
        return this.getPlaceholder();
      });
      valueRows.push(`(${rowPlaceholders.join(', ')})`);
    }
    
    let sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valueRows.join(', ')}`;
    
    if (this.databaseType === 'postgresql') {
      sql += ' RETURNING id';
    }
    
    this.params = values;
    
    return { sql, params: this.params };
  }
}

module.exports = QueryBuilder;