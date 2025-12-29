"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactFormSchema, ContactFormData } from "@/lib/schemas";

export default function Contact() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
  });

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setSubmitStatus("success");
      reset();
    } catch (error) {
      console.error(error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="w-full max-w-md mx-auto px-4 py-20">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-serif mb-2">Contact</h2>
        <p className="text-xs font-mono text-gray-500">GET IN TOUCH</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 font-mono text-sm">
        <div className="space-y-2">
          <label htmlFor="name" className="block uppercase text-xs tracking-wider">
            Name
          </label>
          <input
            {...register("name")}
            id="name"
            className="w-full bg-transparent border-b border-gray-300 py-2 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300"
            placeholder="Jane Doe"
          />
          {errors.name && (
            <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="block uppercase text-xs tracking-wider">
            Email
          </label>
          <input
            {...register("email")}
            id="email"
            type="email"
            className="w-full bg-transparent border-b border-gray-300 py-2 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300"
            placeholder="jane@example.com"
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="message" className="block uppercase text-xs tracking-wider">
            Message
          </label>
          <textarea
            {...register("message")}
            id="message"
            rows={4}
            className="w-full bg-transparent border-b border-gray-300 py-2 focus:border-black focus:outline-none transition-colors resize-none rounded-none placeholder:text-gray-300"
            placeholder="Tell us about your project..."
          />
          {errors.message && (
            <p className="text-red-500 text-xs mt-1">{errors.message.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-black text-white py-4 uppercase text-xs tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-8"
        >
          {isSubmitting ? "Sending..." : "Send Message"}
        </button>

        {submitStatus === "success" && (
          <p className="text-green-600 text-center text-xs mt-4">
            Message sent successfully. We'll be in touch.
          </p>
        )}
        {submitStatus === "error" && (
          <p className="text-red-500 text-center text-xs mt-4">
            Something went wrong. Please try again or email us directly.
          </p>
        )}
      </form>
    </section>
  );
}

