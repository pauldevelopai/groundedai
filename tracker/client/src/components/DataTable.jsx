export default function DataTable({ columns, data, onRowClick, emptyMessage = 'No data found.' }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <h3>{emptyMessage}</h3>
      </div>
    );
  }

  return (
    <table className={`data-table ${onRowClick ? 'data-table-clickable' : ''}`}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.id} onClick={() => onRowClick?.(row)}>
            {columns.map(col => (
              <td key={col.key}>
                {col.render ? col.render(row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
