/* eslint-disable @typescript-eslint/no-explicit-any */
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";
import { useRef, useState } from "react";

const UploadPage = () => {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [redirecting, setRedirecting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFile(e.target.files?.[0] || null);
        setSuccessMsg("");
        setErrorMsg("");
    };

    const handleChooseFile = () => {
        fileInputRef.current?.click();
    };

    const handleUpload = async () => {
        if (!file) return setErrorMsg("Please select a file to upload.");

        const formData = new FormData();
        formData.append("file", file);

        setUploading(true);
        setSuccessMsg("");
        setErrorMsg("");

        try {
            const res = await axios.post("http://localhost:8000/upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            // Consider any 2xx as success
            if (res.status >= 200 && res.status < 300) {
                setSuccessMsg("File uploaded successfully! Redirecting...");
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
                if (!redirecting) {
                    setRedirecting(true);
                    // Redirect immediately and replace history entry
                    window.location.replace("/graph/" + res.data.title);
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
                "Failed to upload file."
            );
            return;
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="min-h-screen w-full antialiased bg-gradient-to-br from-blue-50 to-indigo-50">
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
                            <Alert variant="destructive">
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
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
                            {/* Left: helper text + selected file */}
                            <div className="space-y-5">
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-900">Instructions</h3>
                                    <ul className="mt-3 list-disc pl-5 text-sm md:text-base text-gray-700 space-y-1.5">
                                        <li>Click the dropzone or the button to pick a file.</li>
                                        <li>We’ll process the document and build the graph.</li>
                                        <li>Large files may take a moment to upload.</li>
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
                                <Label htmlFor="file-upload" className="font-medium text-gray-800">
                                    Select File
                                </Label>

                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={handleChooseFile}
                                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleChooseFile()}
                                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300/70 bg-white p-12 md:p-16 text-center transition-colors hover:border-blue-600/60 cursor-pointer"
                                >
                                    <div className="text-5xl md:text-6xl mb-4">📄</div>
                                    <div className="text-sm md:text-base text-gray-600">
                                        Drag & drop your file here, or click to browse
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
