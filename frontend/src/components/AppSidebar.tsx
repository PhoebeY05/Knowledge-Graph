import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import axios from "axios";
import { UploadIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function AppSidebar() {
  const [graphs, setGraphs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/sidebar`);
        const data = Array.isArray(res.data) ? res.data : [];
        if (!cancelled) setGraphs(data);
      } catch (e) {
        console.error("[Sidebar] Failed to load graphs", e);
        if (!cancelled) setGraphs([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Upload */}
              <SidebarMenuItem key="upload">
                <SidebarMenuButton asChild>
                  <Link to="/">
                    <UploadIcon />
                    <span>Upload</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* Graphs */}
              <SidebarMenu>
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton asChild>
                        <span>Graphs</span>
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {graphs.length == 0 ? <SidebarMenuSubItem>
                          <Link to={`/graph/${encodeURIComponent("neo4j")}`}>neo4j</Link>
                        </SidebarMenuSubItem> : 
                        graphs.map((db) => (
                          <SidebarMenuSubItem key={db}>
                            <Link to={`/graph/${encodeURIComponent(db)}`}>{db}</Link>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
