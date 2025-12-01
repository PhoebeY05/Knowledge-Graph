/* eslint-disable @typescript-eslint/no-explicit-any */
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarTrigger } from "@/components/ui/sidebar";
import axios from "axios";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const UploadPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // new drag state

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // When moving within children, relatedTarget may be null; be lenient
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    const dropped = dt.files[0];
    if (dropped) {
      setFile(dropped);
      setSuccessMsg("");
      setErrorMsg("");
    }
  };

  const handleUpload = async () => {
    if (!file) return setErrorMsg("Please select a file to upload.");

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const res = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Consider any 2xx as success
      if (res.status >= 200 && res.status < 300) {
        setSuccessMsg("File uploaded successfully! Redirecting...");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (!redirecting) {
          setRedirecting(true);
          // Client-side navigation (works with HashRouter on Render)
          navigate(`/graph/${encodeURIComponent(res.data.title)}`, {
            replace: true,
          });
          return;
        }
      } else {
        // Non-2xx -> error
        setErrorMsg(`Upload failed: ${res.status}`);
        return;
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err?.response?.data?.message ||
        err?.message ||
        "Failed to upload file.",
      );
      return;
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen w-full antialiased bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Toolbar: sidebar toggle */}
      <div className="p-2 bg-white-100 flex items-center">
        <SidebarTrigger />
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
        <Card className="w-full rounded-2xl border border-gray-200/60 bg-white/85 shadow-xl backdrop-blur">
          <CardHeader className="pb-0">
            <CardTitle className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
              Upload Your File
            </CardTitle>
            <p className="mt-3 text-base md:text-lg text-gray-600">
              Supported formats: PDF, JPG, PNG. Max ~10MB.
            </p>
          </CardHeader>

          <CardContent className="p-6 md:p-10">
            {/* Alerts */}
            {successMsg && (
              <Alert>
                <AlertDescription>{successMsg}</AlertDescription>
              </Alert>
            )}
            {errorMsg && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            {/* Hidden file input */}
            <Input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            // accept attribute optional; uncomment to restrict types:
            // accept=".pdf,.png,.jpg,.jpeg"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
              {/* Left: helper text + selected file */}
              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Instructions
                  </h3>
                  <ul className="mt-3 list-disc pl-5 text-sm md:text-base text-gray-700 space-y-1.5">
                    <li>Click the dropzone or the button to pick a file.</li>
                    <li>We’ll process the document and build the graph.</li>
                    <li>
                      {
                        "Large files (> 20,000 characters) may take up to 30 minutes to upload."
                      }
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="text-sm text-gray-500">Selected file</div>
                  <div className="mt-1 font-medium text-gray-800 truncate">
                    {file ? file.name : "No file selected"}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleUpload}
                    disabled={uploading || !file}
                    className="w-full py-4 text-base md:text-lg"
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>

              {/* Right: large dropzone */}
              <div className="space-y-3">
                <Label
                  htmlFor="file-upload"
                  className="font-medium text-gray-800"
                >
                  Select File
                </Label>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleChooseFile}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") && handleChooseFile()
                  }
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={[
                    "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white p-12 md:p-16 text-center transition-colors cursor-pointer",
                    isDragging
                      ? "border-blue-600/80 bg-blue-50"
                      : "border-gray-300/70 hover:border-blue-600/60",
                    uploading ? "opacity-60 pointer-events-none" : "",
                  ].join(" ")}
                >
                  <div className="text-5xl md:text-6xl mb-4">📄</div>
                  <div className="text-sm md:text-base text-gray-600">
                    {isDragging
                      ? "Release to upload this file"
                      : "Drag & drop your file here, or click to browse"}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-5"
                    disabled={uploading}
                    onClick={handleChooseFile}
                  >
                    Choose file
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UploadPage;
