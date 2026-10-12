import { Link } from "react-router-dom";
import { useCategoriesQuery } from "../hooks/queries";

export default function Categories() {
  const { data: categories = [], isLoading } = useCategoriesQuery();

  return (
    <div>
      <h2>Categories</h2>
      <p style={{ color: "#666", marginTop: -6 }}>
        Open a category to see its products. Create new categories when adding
        products on the Register page.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.id}</td>
              <td>
                <Link to={`/categories/${c.id}`}>{c.name}</Link>
              </td>
              <td>
                <Link to={`/categories/${c.id}`} className="btn btn-outline">
                  View products
                </Link>
              </td>
            </tr>
          ))}
          {categories.length === 0 && !isLoading && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "#777" }}>
                No categories yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
