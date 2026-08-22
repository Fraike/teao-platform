import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Typography, Spin, Empty, message } from "antd";
import { SearchOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { api } from "../lib/api";
import { getCache, setCache } from "../lib/kingdeeCache";
import type { KingdeeMaterial, KingdeeCategory } from "../types/kingdee";
import styles from "./MaterialDataPage.module.css";
import { ResponsiveTable } from "../components/ResponsiveTable";

const { Title, Text } = Typography;

const CACHE_KEY_MAT = "materials";
const CACHE_KEY_CAT = "categories";

export function MaterialDataPage() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<KingdeeMaterial[]>(() => getCache<KingdeeMaterial[]>(CACHE_KEY_MAT) || []);
  const [categories, setCategories] = useState<KingdeeCategory[]>(() => getCache<KingdeeCategory[]>(CACHE_KEY_CAT) || []);
  const [loading, setLoading] = useState(() => !getCache<KingdeeMaterial[]>(CACHE_KEY_MAT));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [matRes, catRes] = await Promise.all([
        api.get<{ ok: boolean; data: KingdeeMaterial[] }>("/api/kingdee/materials"),
        api.get<{ ok: boolean; data: KingdeeCategory[] }>("/api/kingdee/categories"),
      ]);
      // 客户端根据 materials 计算每个分类的商品数量
      const countMap = new Map<string, number>();
      for (const m of matRes.data) {
        if (m.parent_id) {
          countMap.set(m.parent_id, (countMap.get(m.parent_id) || 0) + 1);
        }
      }
      const enriched = catRes.data.map((cat) => {
        const children = cat.children?.map((child) => ({
          ...child,
          count: countMap.get(child.id) || 0,
        }));
        return {
          ...cat,
          count: children
            ? children.reduce((sum, c) => sum + c.count, 0)
            : countMap.get(cat.id) || 0,
          children,
        };
      });

      setMaterials(matRes.data);
      setCategories(enriched);
      setCache(CACHE_KEY_MAT, matRes.data);
      setCache(CACHE_KEY_CAT, enriched);
    } catch (err) {
      message.error((err as Error).message || "获取商品数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchData(!getCache<KingdeeMaterial[]>(CACHE_KEY_MAT)));
  }, [fetchData]);

  // 父分类 → 子分类 ID 集合（用于大类筛选）
  const parentChildMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const cat of categories) {
      if (cat.children) {
        map.set(cat.id, cat.children.map((c) => c.id));
      }
    }
    return map;
  }, [categories]);

  // 子分类 → 父分类名称（用于显示）
  const childParentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      if (cat.children) {
        for (const child of cat.children) {
          map.set(child.id, cat.name);
        }
      }
    }
    return map;
  }, [categories]);

  // 无分类商品数量
  const uncategorizedCount = useMemo(
    () => materials.filter((m) => !m.parent_id).length,
    [materials]
  );

  // 按分类+搜索过滤
  const filteredMaterials = useMemo(() => {
    let list = materials;
    if (activeCategory === "__none__") {
      list = list.filter((m) => !m.parent_id);
    } else if (activeCategory) {
      // 检查是否是大类（父分类）
      const childIds = parentChildMap.get(activeCategory);
      if (childIds) {
        // 大类：筛选所有子分类的商品
        list = list.filter((m) => childIds.includes(m.parent_id));
      } else {
        // 子分类：精确筛选
        list = list.filter((m) => m.parent_id === activeCategory);
      }
    }
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.number.toLowerCase().includes(kw) ||
          m.name.toLowerCase().includes(kw) ||
          m.help_code?.toLowerCase().includes(kw) ||
          m.barcode?.toLowerCase().includes(kw)
      );
    }
    return list;
  }, [materials, activeCategory, search, parentChildMap]);

  // 切换父分类展开/折叠
  const toggleExpand = (parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const columns: TableColumnsType<KingdeeMaterial> = [
    {
      title: "编码",
      dataIndex: "number",
      width: 110,
      fixed: "left",
      render: (v: string, record: KingdeeMaterial) => (
        <a onClick={() => navigate(`/materials/${record.id}`)}>{v}</a>
      ),
    },
    {
      title: "名称",
      dataIndex: "name",
      width: 320,
      ellipsis: true,
    },
    {
      title: "规格",
      dataIndex: "model",
      width: 120,
      ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "单位",
      dataIndex: "base_unit_name",
      width: 60,
    },
    {
      title: "默认仓库",
      dataIndex: "stock_name",
      width: 100,
      render: (v) => v || "-",
    },
    {
      title: "分类",
      dataIndex: "parent_name",
      width: 120,
      ellipsis: true,
      render: (v) => v || <Text type="secondary">未分类</Text>,
    },
    {
      title: "条码",
      dataIndex: "barcode",
      width: 160,
      ellipsis: true,
      render: (v) => v || "-",
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Title level={4} style={{ margin: 0 }}>
            商品资料
          </Title>
          <Text type="secondary">
            共 {materials.length} 个商品，{categories.length} 个分类
          </Text>
        </div>
        <ReloadOutlined
          onClick={() => fetchData(true)}
          style={{ cursor: "pointer", fontSize: 16, color: "#1677ff" }}
          spin={loading}
        />
      </div>

      <div className={styles.body}>
        {/* 左侧分类 */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>商品分类</div>
          <div
            className={`${styles.categoryItem} ${!activeCategory ? styles.categoryItemActive : ""}`}
            onClick={() => setActiveCategory(null)}
          >
            <span>全部</span>
            <span className={styles.categoryCount}>{materials.length}</span>
          </div>
          {categories.map((cat) => {
            const isParent = !!(cat.children && cat.children.length > 0);
            const isExpanded = expandedParents.has(cat.id);
            const isActive = activeCategory === cat.id;

            return (
              <div key={cat.id}>
                <div
                  className={`${styles.categoryItem} ${isActive ? styles.categoryItemActive : ""}`}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    if (!isExpanded) {
                      setExpandedParents((prev) => new Set(prev).add(cat.id));
                    }
                  }}
                >
                  <span>
                    {isParent && (
                      <span
                        className={`${styles.expandArrow} ${isExpanded ? styles.expandArrowOpen : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(cat.id);
                        }}
                      >
                        <RightOutlined />
                      </span>
                    )}
                    {cat.name}
                  </span>
                  <span className={styles.categoryCount}>{cat.count}</span>
                </div>
                {isParent && isExpanded && cat.children!.map((child) => (
                  <div
                    key={child.id}
                    className={`${styles.subCategoryItem} ${activeCategory === child.id ? styles.subCategoryItemActive : ""}`}
                    onClick={() => setActiveCategory(child.id)}
                  >
                    <span>{child.name}</span>
                    <span className={styles.categoryCount}>{child.count}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {uncategorizedCount > 0 && (
            <div
              className={`${styles.categoryItem} ${activeCategory === "__none__" ? styles.categoryItemActive : ""}`}
              onClick={() => setActiveCategory("__none__")}
            >
              <span>未分类</span>
              <span className={styles.categoryCount}>{uncategorizedCount}</span>
            </div>
          )}
        </div>

        {/* 右侧表格 */}
        <div className={styles.main}>
          <div className={styles.searchBar}>
            <Input
              placeholder="搜索编码、名称、助记码、条码..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 320 }}
            />
            <Text type="secondary">
              {activeCategory
                ? `筛选: ${(() => {
                    if (activeCategory === "__none__") return "未分类";
                    const parent = categories.find((c) => c.id === activeCategory);
                    if (parent) return parent.name;
                    // 是子分类
                    const pname = childParentNameMap.get(activeCategory);
                    const childCat = categories.flatMap((c) => c.children || []).find((c) => c.id === activeCategory);
                    return pname && childCat ? `${pname} / ${childCat.name}` : activeCategory;
                  })()}`
                : "全部商品"}
              （{filteredMaterials.length} 条）
            </Text>
          </div>

          {loading ? (
            <div className={styles.emptyWrap}>
              <Spin size="large" tip="加载中..." />
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className={styles.emptyWrap}>
              <Empty description="没有匹配的商品" />
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <ResponsiveTable
                columns={columns}
                dataSource={filteredMaterials}
                rowKey="id"
                loading={loading}
                size="small"
                minWidth={1000}
                scroll={{ y: "calc(100vh - 280px)" }}
                pagination={{
                  defaultPageSize: 50,
                  showSizeChanger: true,
                  pageSizeOptions: ["20", "50", "100", "200"],
                  showTotal: (total) => `共 ${total} 条`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
