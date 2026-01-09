"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactFormSchema, ContactFormData } from "@/lib/schemas";
import { sendContactForm } from "@/lib/services/contact-service";

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
      await sendContactForm(data);
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
    <section className="w-full max-w-[28rem] mx-auto px-4 py-20">
      <div className="mb-10 text-center">
        <p className="text-[0.75rem] font-mono text-gray-500 tracking-wider">GET IN TOUCH</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 font-mono text-[0.875rem]">
        <div className="space-y-2">
          <label htmlFor="name" className="block uppercase text-[0.75rem] tracking-wider text-black">
            Name
          </label>
          <input
            {...register("name")}
            id="name"
            className="w-full bg-transparent border-b border-gray-300 py-2 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300 text-black"
            placeholder="Jane Doe"
          />
          {errors.name && (
            <p className="text-red-500 text-[0.75rem] mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="companyName" className="block uppercase text-[0.75rem] tracking-wider text-black">
            Company Name <span className="text-gray-400 normal-case">(optional)</span>
          </label>
          <input
            {...register("companyName")}
            id="companyName"
            className="w-full bg-transparent border-b border-gray-300 py-2 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300 text-black"
            placeholder="Acme Inc."
          />
          {errors.companyName && (
            <p className="text-red-500 text-[0.75rem] mt-1">{errors.companyName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="block uppercase text-[0.75rem] tracking-wider text-black">
            Email
          </label>
          <input
            {...register("email")}
            id="email"
            type="email"
            className="w-full bg-transparent border-b border-gray-300 py-2 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300 text-black"
            placeholder="jane@example.com"
          />
          {errors.email && (
            <p className="text-red-500 text-[0.75rem] mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="message" className="block uppercase text-[0.75rem] tracking-wider text-black">
            Message
          </label>
          <textarea
            {...register("message")}
            id="message"
            rows={4}
            className="w-full bg-transparent border-b border-gray-300 py-2 focus:border-black focus:outline-none transition-colors resize-none rounded-none placeholder:text-gray-300 text-black"
            placeholder="Tell us about your project..."
          />
          {errors.message && (
            <p className="text-red-500 text-[0.75rem] mt-1">{errors.message.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-black text-white py-4 uppercase text-[0.75rem] tracking-[0.2em] hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-8"
        >
          {isSubmitting ? "Sending..." : "Send Message"}
        </button>

        {submitStatus === "success" && (
          <p className="text-green-600 text-center text-[0.75rem] mt-4">
            Message sent successfully. We'll be in touch.
          </p>
        )}
        {submitStatus === "error" && (
          <p className="text-red-500 text-center text-[0.75rem] mt-4">
            Something went wrong. Please try again or email us directly.
          </p>
        )}
      </form>
    </section>
  );
}
